import { Injectable, Logger } from '@nestjs/common';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { CapabilityNotAvailable } from './errors';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

export type MediaOperation = 'image' | 'video' | 'tts' | 'stt' | 'upscale' | 'bg-remove' | 'inpaint';

interface MediaProviderConfig {
  enabled: boolean;
  operations: string[];
  c2paAvailable?: boolean;
  credentials?: Record<string, string>;
}

// Read-only, credential-free view of which media providers are active per operation.
// Surfaced to non-admin users (4F) so they can see what media capabilities the instance
// has configured without exposing any provider secrets.
export interface MediaProviderSummaryEntry {
  operation: MediaOperation;
  available: boolean;
  providers: { id: string; enabled: boolean; c2paAvailable: boolean }[];
}

const ALL_MEDIA_OPERATIONS: MediaOperation[] = [
  'image',
  'video',
  'tts',
  'stt',
  'upscale',
  'bg-remove',
  'inpaint',
];

// §6.4 reconciliation — map each media operation back onto the legacy ai_images /
// ai_videos credit counters so SubscriptionService.getCreditsFrom keeps seeing
// consumption. TTS/STT have no legacy credit equivalent → undefined.
const OPERATION_CREDIT_TYPE: Record<MediaOperation, 'ai_images' | 'ai_videos' | undefined> = {
  image: 'ai_images',
  upscale: 'ai_images',
  'bg-remove': 'ai_images',
  inpaint: 'ai_images',
  video: 'ai_videos',
  tts: undefined,
  stt: undefined,
};

// Rough default per-operation USD cost. The @reaatech/media-pipeline-mcp-cost ledger
// records the `usd` it is given (it carries no pricing table), so the facade supplies
// these estimates. They populate AIMediaJob.costUsd and feed the §6 budget view as the
// $-denominated layer on top of the count-based credit allowance (§6.4).
const OPERATION_COST_USD: Record<MediaOperation, number> = {
  image: 0.04,
  video: 0.5,
  upscale: 0.01,
  'bg-remove': 0.01,
  inpaint: 0.02,
  tts: 0.015,
  stt: 0.01,
};

// Operations whose output is freshly generated/edited visual media — eligible for
// C2PA provenance signing (§3.5.20). TTS/STT audio + transcription are excluded.
const PROVENANCE_OPERATIONS = new Set<MediaOperation>(['image', 'video', 'upscale', 'inpaint', 'bg-remove']);

interface ProvenanceSettings {
  enabled?: boolean;
  signingKey?: any;
  signGenerativeOnly?: boolean;
  embedMode?: 'in-file' | 'sidecar' | 'both';
}

interface MediaStorageSettings {
  type?: 'local' | 's3' | 'gcs';
  config?: Record<string, any>;
}

@Injectable()
export class AiMediaService {
  private _logger = new Logger(AiMediaService.name);
  private _providerCache = new Map<string, any>();
  private _providerConfigCache: { data: Record<string, MediaProviderConfig>; ts: number } | null = null;
  private readonly _configTtl = 60_000;

  constructor(
    private _aiSettings: AiSettingsService,
    private _aiModelProvider: AIModelProvider,
    private _aiSettingsManager: AiSettingsManager,
  ) {}

  // Lazy, guarded singletons for the @reaatech media-pipeline infra packages.
  // `null` = not yet resolved; `false` = resolved-and-unavailable (don't retry).
  private _costLedger: any | null | false = null;
  private _artifactStore: any | null | false = null;
  private _provenanceSigner: any | null | false = null;

  invalidateProviderCache(): void {
    this._providerCache.clear();
    this._providerConfigCache = null;
    this._costLedger = null;
    this._artifactStore = null;
    this._provenanceSigner = null;
  }

  // 4F — read-only summary of configured media providers for the user-facing Brand & AI
  // settings panel. Returns one entry per media operation listing the enabled providers
  // (by id) and whether C2PA provenance is available. Never returns credentials.
  async getMediaProviderSummary(): Promise<MediaProviderSummaryEntry[]> {
    const configs = await this._getMediaProviderConfigs();
    return ALL_MEDIA_OPERATIONS.map((operation) => {
      const providers = Object.entries(configs)
        .filter(
          ([, cfg]) => !!cfg?.enabled && (cfg.operations?.includes(operation) ?? false),
        )
        .map(([id, cfg]) => ({
          id,
          enabled: !!cfg.enabled,
          c2paAvailable: !!cfg.c2paAvailable,
        }));
      return { operation, available: providers.length > 0, providers };
    });
  }

  // ── @reaatech/media-pipeline-mcp-cost — per-call cost ledger (§2.4/§6.4) ──
  private async _getCostLedger(): Promise<any | null> {
    if (this._costLedger !== null) return this._costLedger || null;
    try {
      const { InMemoryCostLedger } = await import('@reaatech/media-pipeline-mcp-cost');
      this._costLedger = new InMemoryCostLedger();
    } catch (err: any) {
      this._logger.warn(`media-pipeline-mcp-cost unavailable: ${err?.message}`);
      this._costLedger = false;
    }
    return this._costLedger || null;
  }

  // ── @reaatech/media-pipeline-mcp-storage — artifact persistence (§2.4) ──
  // Configured via settings.ragSettings.mediaStorage; absent = no storage (outputs
  // keep their provider-hosted URL — byte-for-byte today's behaviour).
  private async _getArtifactStore(): Promise<any | null> {
    if (this._artifactStore !== null) return this._artifactStore || null;
    try {
      const settings = await this._aiSettingsManager.getSettings();
      const storageCfg: MediaStorageSettings | undefined = settings?.ragSettings?.mediaStorage;
      if (!storageCfg?.type || !storageCfg?.config) {
        this._artifactStore = false;
        return null;
      }
      const { createStorage } = await import('@reaatech/media-pipeline-mcp-storage');
      this._artifactStore = createStorage({ type: storageCfg.type, config: storageCfg.config } as any);
    } catch (err: any) {
      this._logger.warn(`media-pipeline-mcp-storage unavailable: ${err?.message}`);
      this._artifactStore = false;
    }
    return this._artifactStore || null;
  }

  // ── @reaatech/media-pipeline-mcp-provenance — C2PA signing (§3.5.20) ──
  // Off unless settings.ragSettings.provenance.enabled with a signing key. Degrades
  // to unsigned output silently when disabled or unavailable (risk register).
  private async _getProvenanceSigner(): Promise<any | null> {
    if (this._provenanceSigner !== null) return this._provenanceSigner || null;
    try {
      const settings = await this._aiSettingsManager.getSettings();
      const prov: ProvenanceSettings | undefined = settings?.ragSettings?.provenance;
      if (!prov?.enabled || !prov?.signingKey) {
        this._provenanceSigner = false;
        return null;
      }
      const { ProvenanceSigner } = await import('@reaatech/media-pipeline-mcp-provenance');
      this._provenanceSigner = new ProvenanceSigner({
        enabled: true,
        signingKey: prov.signingKey,
        signGenerativeOnly: prov.signGenerativeOnly ?? true,
        embedMode: prov.embedMode ?? 'sidecar',
      } as any);
    } catch (err: any) {
      this._logger.warn(`media-pipeline-mcp-provenance unavailable: ${err?.message}`);
      this._provenanceSigner = false;
    }
    return this._provenanceSigner || null;
  }

  private async _signProvenance(
    operation: MediaOperation,
    provider: string,
    model: string,
    artifactUrl?: string,
  ): Promise<string | undefined> {
    if (!PROVENANCE_OPERATIONS.has(operation) || !artifactUrl) return undefined;
    const signer = await this._getProvenanceSigner();
    if (!signer) return undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const runId = `media-${Date.now()}-${require('crypto').randomBytes(3).toString('hex')}`;
      const result = await signer.sign(artifactUrl, {
        title: `AI ${operation}`,
        format: 'application/octet-stream',
        claimGenerator: 'postmill/ai-media',
        pipelineDefHash: 'na',
        runId,
        generatedAt: new Date().toISOString(),
        assertions: [
          {
            kind: 'c2pa.actions',
            actions: [{ action: 'c2pa.created', when: new Date().toISOString(), softwareAgent: provider }],
          },
          { kind: 'c2pa.model', providerId: provider, modelId: model },
        ],
      });
      return result?.manifestUri;
    } catch (err: any) {
      this._logger.warn(`Provenance signing failed (continuing unsigned): ${err?.message}`);
      return undefined;
    }
  }

  private async _chargeCost(
    operation: MediaOperation,
    provider: string,
    model: string,
    orgId?: string,
  ): Promise<number> {
    const usd = OPERATION_COST_USD[operation] ?? 0;
    const ledger = await this._getCostLedger();
    if (ledger) {
      try {
        await ledger.charge({
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          id: `media-${Date.now()}-${require('crypto').randomBytes(3).toString('hex')}`,
          runId: orgId ?? 'system',
          tenantId: orgId,
          stepId: operation,
          provider,
          operation,
          modelId: model,
          inputUnits: 1,
          outputUnits: 1,
          inputUnitType: 'requests',
          outputUnitType: 'requests',
          usd,
          at: new Date().toISOString(),
        });
      } catch (err: any) {
        this._logger.warn(`Cost ledger charge failed: ${err?.message}`);
      }
    }
    return usd;
  }

  // Single funnel for persisting a finished media job with the §2.4/§6.4 metadata:
  // real $ cost (-cost), legacy creditType mapping, optional C2PA provenance
  // (-provenance) and optional artifact persistence (-storage).
  private async _persistJob(params: {
    operation: MediaOperation;
    provider: string;
    model?: string;
    orgId?: string;
    userId?: string;
    artifactUrl?: string;
    status?: string;
    error?: string;
  }): Promise<{ artifactUrl?: string; provenance?: string; costUsd: number }> {
    const model = params.model || params.provider;
    const costUsd = await this._chargeCost(params.operation, params.provider, model, params.orgId);
    const provenance = await this._signProvenance(
      params.operation,
      params.provider,
      model,
      params.artifactUrl,
    );

    if (params.orgId) {
      await this._aiSettings.createMediaJob({
        organizationId: params.orgId,
        userId: params.userId,
        provider: params.provider,
        operation: params.operation,
        status: params.status ?? 'done',
        artifactUrl: params.artifactUrl || undefined,
        provenance,
        costUsd,
        creditType: OPERATION_CREDIT_TYPE[params.operation],
        error: params.error,
      });
    }

    return { artifactUrl: params.artifactUrl, provenance, costUsd };
  }

  private async _getMediaProviderConfigs(): Promise<Record<string, MediaProviderConfig>> {
    if (this._providerConfigCache && Date.now() - this._providerConfigCache.ts < this._configTtl) {
      return this._providerConfigCache.data;
    }

    const settings = await this._aiSettingsManager.getSettings();
    const result: Record<string, MediaProviderConfig> = {};

    if (settings?.ragSettings && typeof settings.ragSettings === 'object') {
      const mp = settings.ragSettings.mediaProviders;
      if (mp && typeof mp === 'object') {
        Object.assign(result, mp);
      }
    }

    // Also read provider configs for credentials
    const configs = await this._aiSettings.getProviderConfigs();
    for (const cfg of configs) {
      if (result[cfg.identifier]) {
        try {
          const decrypted = AuthService.fixedDecryption(cfg.credentials || '');
          result[cfg.identifier].credentials = JSON.parse(decrypted);
        } catch {
          // credentials not available or invalid
        }
      }
    }

    this._providerConfigCache = { data: result, ts: Date.now() };
    return result;
  }

  private _hasOperation(providerId: string, operation: string): boolean {
    const configs = this._providerConfigCache?.data;
    if (!configs) return false;
    const cfg = configs[providerId];
    if (!cfg?.enabled) return false;
    return cfg.operations?.includes(operation) ?? false;
  }

  private _getProviderCreds(providerId: string): Record<string, string> | undefined {
    return this._providerConfigCache?.data?.[providerId]?.credentials;
  }

  private async _getOrCreateReplicateProvider(): Promise<any> {
    if (this._providerCache.has('replicate')) return this._providerCache.get('replicate');

    try {
      const { defineReplicateProvider } = await import('@reaatech/media-pipeline-mcp-replicate');
      const creds = this._getProviderCreds('replicate');
      if (!creds?.apiKey) {
        throw new CapabilityNotAvailable(
          'Replicate API key not configured. Please add credentials in Admin > AI Settings.',
          'image_edit',
        );
      }
      const provider = defineReplicateProvider({ apiKey: creds.apiKey });
      this._providerCache.set('replicate', provider);
      return provider;
    } catch (err: any) {
      if (err instanceof CapabilityNotAvailable) throw err;
      throw new CapabilityNotAvailable(
        `Replicate provider not available: ${err.message}`,
        'image_edit',
      );
    }
  }

  private async _getOrCreateLumaProvider(): Promise<any> {
    if (this._providerCache.has('luma')) return this._providerCache.get('luma');

    try {
      const { LumaProvider } = await import('@reaatech/media-pipeline-mcp-luma');
      const creds = this._getProviderCreds('luma');
      if (!creds?.apiKey) {
        throw new CapabilityNotAvailable(
          'Luma API key not configured. Please add credentials in Admin > AI Settings.',
          'video',
        );
      }
      const provider = new LumaProvider({ apiKey: creds.apiKey });
      this._providerCache.set('luma', provider);
      return provider;
    } catch (err: any) {
      if (err instanceof CapabilityNotAvailable) throw err;
      throw new CapabilityNotAvailable(
        `Luma video provider not available: ${err.message}`,
        'video',
      );
    }
  }

  private async _getOrCreateElevenLabsProvider(): Promise<any> {
    if (this._providerCache.has('elevenlabs')) return this._providerCache.get('elevenlabs');

    try {
      const { defineElevenLabsProvider } = await import('@reaatech/media-pipeline-mcp-elevenlabs');
      const creds = this._getProviderCreds('elevenlabs');
      if (!creds?.apiKey) {
        throw new CapabilityNotAvailable(
          'ElevenLabs API key not configured. Please add credentials in Admin > AI Settings.',
          'speech',
        );
      }
      const provider = defineElevenLabsProvider({ apiKey: creds.apiKey });
      this._providerCache.set('elevenlabs', provider);
      return provider;
    } catch (err: any) {
      if (err instanceof CapabilityNotAvailable) throw err;
      throw new CapabilityNotAvailable(
        `ElevenLabs TTS provider not available: ${err.message}`,
        'speech',
      );
    }
  }

  private async _getOrCreateDeepgramProvider(): Promise<any> {
    if (this._providerCache.has('deepgram')) return this._providerCache.get('deepgram');

    try {
      const { defineDeepgramProvider } = await import('@reaatech/media-pipeline-mcp-deepgram');
      const creds = this._getProviderCreds('deepgram');
      if (!creds?.apiKey) {
        throw new CapabilityNotAvailable(
          'Deepgram API key not configured. Please add credentials in Admin > AI Settings.',
          'speech',
        );
      }
      const provider = defineDeepgramProvider({ apiKey: creds.apiKey });
      this._providerCache.set('deepgram', provider);
      return provider;
    } catch (err: any) {
      if (err instanceof CapabilityNotAvailable) throw err;
      throw new CapabilityNotAvailable(
        `Deepgram STT provider not available: ${err.message}`,
        'speech',
      );
    }
  }

  async generateImage(prompt: string, options?: { size?: string; orgId?: string; userId?: string }): Promise<string> {
    const model = await this._aiModelProvider.imageModel('utility', options?.orgId);
    if (!model) {
      throw new CapabilityNotAvailable('Image generation is not available on the current AI provider', 'image');
    }

    const result = await model.generate(prompt, { size: options?.size });

    await this._persistJob({
      operation: 'image',
      provider: 'ai-media',
      orgId: options?.orgId,
      userId: options?.userId,
      artifactUrl: result,
    });

    return result;
  }

  async generateVideo(prompt: string, options?: { orgId?: string; userId?: string }): Promise<string> {
    try {
      await this._getMediaProviderConfigs();
      if (!this._hasOperation('luma', 'video')) {
        throw new CapabilityNotAvailable(
          'Video generation is not enabled. Enable Luma in Admin > AI Settings > Media Providers.',
          'video',
        );
      }

      const luma = await this._getOrCreateLumaProvider();
      const result = await luma.execute({
        operation: 'video.generate',
        input: { prompt },
        options: {},
      });

      const outputUrl = result?.output?.uri || result?.output?.url || result?.uri || result?.url;

      await this._persistJob({
        operation: 'video',
        provider: 'luma',
        orgId: options?.orgId,
        userId: options?.userId,
        artifactUrl: outputUrl,
      });

      return outputUrl || 'video_generation_completed';
    } catch (err: any) {
      if (err instanceof CapabilityNotAvailable) {
        this._logger.warn('Video generation not available — falling back to image');
        const model = await this._aiModelProvider.imageModel('utility', options?.orgId);
        const result = await model.generate(prompt, { size: '1024x1024' });
        return result;
      }
      this._logger.error(`Video generation failed: ${err.message}`);
      const model = await this._aiModelProvider.imageModel('utility', options?.orgId);
      const result = await model.generate(prompt, { size: '1024x1024' });
      return result;
    }
  }

  async textToSpeech(text: string, options?: { voice?: string; orgId?: string; userId?: string }): Promise<Buffer> {
    await this._getMediaProviderConfigs();

    if (this._hasOperation('elevenlabs', 'tts')) {
      try {
        const elevenlabs = await this._getOrCreateElevenLabsProvider();
        const result = await elevenlabs.execute({
          operation: 'audio.tts',
          input: { text },
          options: { voice: options?.voice || 'alloy' },
        });

        const audioData = result?.output?.data || result?.output;
        await this._persistJob({
          operation: 'tts',
          provider: 'elevenlabs',
          orgId: options?.orgId,
          userId: options?.userId,
        });
        if (Buffer.isBuffer(audioData)) return audioData;
        if (typeof audioData === 'string') return Buffer.from(audioData, 'base64');
        return Buffer.from(JSON.stringify(result), 'utf-8');
      } catch (err: any) {
        this._logger.warn(`ElevenLabs TTS failed: ${err.message}`);
      }
    }

    if (this._hasOperation('openai', 'tts')) {
      try {
        const { defineOpenAIProvider } = await import('@reaatech/media-pipeline-mcp-openai' as any);
        const creds = this._getProviderCreds('openai');
        if (creds?.apiKey) {
          const openai = defineOpenAIProvider({ apiKey: creds.apiKey });
          const result = await openai.execute({
            operation: 'audio.tts',
            input: { text },
            options: { voice: options?.voice || 'alloy' },
          });
          const audioData = result?.output?.data || result?.output;
          if (Buffer.isBuffer(audioData)) return audioData;
          if (typeof audioData === 'string') return Buffer.from(audioData, 'base64');
        }
      } catch (err: any) {
        this._logger.warn(`OpenAI TTS failed: ${err.message}`);
      }
    }

    throw new CapabilityNotAvailable(
      'Text-to-speech is not available. Enable ElevenLabs or OpenAI TTS in Admin > AI Settings > Media Providers with valid API keys.',
      'speech',
    );
  }

  async speechToText(audio: Buffer, options?: { orgId?: string }): Promise<string> {
    await this._getMediaProviderConfigs();

    if (this._hasOperation('deepgram', 'stt')) {
      try {
        const deepgram = await this._getOrCreateDeepgramProvider();
        const result = await deepgram.execute({
          operation: 'audio.stt',
          input: { audio },
          options: {},
        });
        const text =
          typeof result?.output?.text === 'string'
            ? result.output.text
            : typeof result?.output === 'string'
              ? result.output
              : undefined;
        if (typeof text === 'string') {
          await this._persistJob({
            operation: 'stt',
            provider: 'deepgram',
            orgId: options?.orgId,
          });
          return text;
        }
      } catch (err: any) {
        this._logger.warn(`Deepgram STT failed: ${err.message}`);
      }
    }

    if (this._hasOperation('openai', 'stt')) {
      try {
        const { defineOpenAIProvider } = await import('@reaatech/media-pipeline-mcp-openai' as any);
        const creds = this._getProviderCreds('openai');
        if (creds?.apiKey) {
          const openai = defineOpenAIProvider({ apiKey: creds.apiKey });
          const result = await openai.execute({
            operation: 'audio.stt',
            input: { audio },
            options: {},
          });
          if (typeof result?.output?.text === 'string') return result.output.text;
          if (typeof result?.output === 'string') return result.output;
        }
      } catch (err: any) {
        this._logger.warn(`OpenAI STT failed: ${err.message}`);
      }
    }

    throw new CapabilityNotAvailable(
      'Speech-to-text is not available. Enable Deepgram or OpenAI STT in Admin > AI Settings > Media Providers with valid API keys.',
      'speech',
    );
  }

  async upscaleImage(imageUrl: string, options?: { orgId?: string }): Promise<string> {
    await this._getMediaProviderConfigs();

    if (this._hasOperation('replicate', 'upscale')) {
      try {
        const replicate = await this._getOrCreateReplicateProvider();
        const result = await replicate.execute({
          operation: 'image.upscale',
          input: { image: imageUrl },
          options: {},
        });
        const outputUrl = result?.output?.uri || result?.output?.url || result?.uri || result?.url;
        if (outputUrl) {
          const persisted = await this._persistJob({
            operation: 'upscale',
            provider: 'replicate',
            orgId: options?.orgId,
            artifactUrl: outputUrl,
          });
          return persisted.artifactUrl || outputUrl;
        }
      } catch (err: any) {
        this._logger.warn(`Replicate upscale failed: ${err.message}`);
      }
    }

    if (this._hasOperation('openai', 'upscale')) {
      try {
        const { defineOpenAIProvider } = await import('@reaatech/media-pipeline-mcp-openai' as any);
        const creds = this._getProviderCreds('openai');
        if (creds?.apiKey) {
          const openai = defineOpenAIProvider({ apiKey: creds.apiKey });
          const result = await openai.execute({
            operation: 'image.upscale',
            input: { image: imageUrl },
            options: {},
          });
          const outputUrl = result?.output?.uri || result?.output?.url || result?.uri || result?.url;
          if (outputUrl) return outputUrl;
        }
      } catch {
        // OpenAI upscale not supported by all models
      }
    }

    this._logger.warn('Upscale not available — returning original');
    return imageUrl;
  }

  async removeBackground(imageUrl: string, options?: { orgId?: string }): Promise<string> {
    await this._getMediaProviderConfigs();

    if (this._hasOperation('replicate', 'bg-remove')) {
      try {
        const replicate = await this._getOrCreateReplicateProvider();
        const result = await replicate.execute({
          operation: 'image.remove_background',
          input: { image: imageUrl },
          options: {},
        });
        const outputUrl = result?.output?.uri || result?.output?.url || result?.uri || result?.url;
        if (outputUrl) {
          const persisted = await this._persistJob({
            operation: 'bg-remove',
            provider: 'replicate',
            orgId: options?.orgId,
            artifactUrl: outputUrl,
          });
          return persisted.artifactUrl || outputUrl;
        }
      } catch (err: any) {
        this._logger.warn(`Replicate bg-remove failed: ${err.message}`);
      }
    }

    throw new CapabilityNotAvailable(
      'Background removal is not available. Enable Replicate in Admin > AI Settings > Media Providers with a valid API key.',
      'image_edit',
    );
  }

  async inpaintImage(imageUrl: string, maskUrl: string, prompt: string, options?: { orgId?: string }): Promise<string> {
    await this._getMediaProviderConfigs();

    if (this._hasOperation('replicate', 'inpaint')) {
      try {
        const replicate = await this._getOrCreateReplicateProvider();
        const result = await replicate.execute({
          operation: 'image.inpaint',
          input: { image: imageUrl, mask: maskUrl, prompt },
          options: {},
        });
        const outputUrl = result?.output?.uri || result?.output?.url || result?.uri || result?.url;
        if (outputUrl) {
          const persisted = await this._persistJob({
            operation: 'inpaint',
            provider: 'replicate',
            orgId: options?.orgId,
            artifactUrl: outputUrl,
          });
          return persisted.artifactUrl || outputUrl;
        }
      } catch (err: any) {
        this._logger.warn(`Replicate inpaint failed: ${err.message}`);
      }
    }

    throw new CapabilityNotAvailable(
      'Inpainting is not available. Enable Replicate in Admin > AI Settings > Media Providers with a valid API key.',
      'image_edit',
    );
  }
}
