import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { MediaProviderRegistry } from '@gitroom/nestjs-libraries/media/media-provider.registry';
import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
} from '@gitroom/nestjs-libraries/media/media-provider-adapter.interface';
import { CapabilityNotAvailable } from './errors';

export type MediaOperation =
  | 'image'
  | 'video'
  | 'audio'
  | 'avatar'
  | 'tts'
  | 'stt'
  | 'upscale'
  | 'bg-remove'
  | 'inpaint';

// Read-only, credential-free view of which media providers are active per operation.
// Surfaced to non-admin users (4F) so they can see what media capabilities the org
// has configured without exposing any provider secrets.
export interface MediaProviderSummaryEntry {
  operation: MediaOperation;
  available: boolean;
  providers: { id: string; enabled: boolean; c2paAvailable: boolean }[];
}

const ALL_MEDIA_OPERATIONS: MediaOperation[] = [
  'image',
  'video',
  'audio',
  'avatar',
  'tts',
  'stt',
  'upscale',
  'bg-remove',
  'inpaint',
];

// Capability-driven resolution (§11.2): each media operation maps onto the adapter
// capability flag that declares support for it.
const OPERATION_CAPABILITY: Record<MediaOperation, keyof MediaProviderCapabilities> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  avatar: 'avatar',
  tts: 'tts',
  stt: 'stt',
  upscale: 'upscale',
  'bg-remove': 'bgRemove',
  inpaint: 'inpaint',
};

// §6.4 reconciliation — map each media operation back onto the legacy ai_images /
// ai_videos credit counters so SubscriptionService.getCreditsFrom keeps seeing
// consumption. TTS/STT/audio have no legacy credit equivalent → undefined.
const OPERATION_CREDIT_TYPE: Record<MediaOperation, 'ai_images' | 'ai_videos' | undefined> = {
  image: 'ai_images',
  upscale: 'ai_images',
  'bg-remove': 'ai_images',
  inpaint: 'ai_images',
  video: 'ai_videos',
  avatar: 'ai_videos',
  audio: undefined,
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
  audio: 0.1,
  avatar: 0.5,
  upscale: 0.01,
  'bg-remove': 0.01,
  inpaint: 0.02,
  tts: 0.015,
  stt: 0.01,
};

// Operations whose output is freshly generated/edited visual media — eligible for
// C2PA provenance signing (§3.5.20). TTS/STT audio + transcription are excluded.
const PROVENANCE_OPERATIONS = new Set<MediaOperation>(['image', 'video', 'avatar', 'upscale', 'inpaint', 'bg-remove']);

interface ProvenanceSettings {
  enabled?: boolean;
  signingKey?: unknown;
  signGenerativeOnly?: boolean;
  embedMode?: 'in-file' | 'sidecar' | 'both';
}

interface CostLedgerLike {
  charge(entry: {
    id: string;
    runId: string;
    tenantId?: string;
    stepId: string;
    provider: string;
    operation: string;
    modelId: string;
    inputUnits: number;
    outputUnits: number;
    inputUnitType: string;
    outputUnitType: string;
    usd: number;
    at: string;
  }): Promise<unknown>;
}

interface ProvenanceSignerLike {
  sign(
    artifactUrl: string,
    manifest: {
      title: string;
      format: string;
      claimGenerator: string;
      pipelineDefHash: string;
      runId: string;
      generatedAt: string;
      assertions: unknown[];
    },
  ): Promise<{ manifestUri?: string } | undefined>;
}

interface ResolvedMediaProvider {
  adapter: MediaProviderAdapter;
  credentials: Record<string, string>;
}

type AsyncOperation = 'video' | 'audio' | 'avatar';

@Injectable()
export class AiMediaService {
  private _logger = new Logger(AiMediaService.name);

  constructor(
    private _aiSettings: AiSettingsService,
    private _aiModelProvider: AIModelProvider,
    private _aiSettingsManager: AiSettingsManager,
    @Optional() private _orgMediaProviderSettings?: OrgMediaProviderSettingsService,
    @Optional() private _mediaRegistry?: MediaProviderRegistry,
    @Optional() private _lifecycle?: MediaJobLifecycleService,
  ) {}

  // Lazy, guarded singletons for the @reaatech media-pipeline infra packages.
  // `null` = not yet resolved; `false` = resolved-and-unavailable (don't retry).
  private _costLedger: CostLedgerLike | null | false = null;
  private _provenanceSigner: ProvenanceSignerLike | null | false = null;

  invalidateProviderCache(): void {
    this._costLedger = null;
    this._provenanceSigner = null;
  }

  // Detect a normalized focal point for an image using the org's vision-capable AI
  // provider when available. Falls back to center (0.5, 0.5) non-fatally when AI is
  // off, the model lacks vision, or the call fails.
  async detectFocalPoint(
    imageUrl: string,
    options?: { orgId?: string },
  ): Promise<{ x: number; y: number; source: 'provider' | 'fallback' }> {
    const fallback = { x: 0.5, y: 0.5, source: 'fallback' as const };
    if (!options?.orgId) {
      return fallback;
    }

    try {
      const config = await this._aiModelProvider.resolveConfigForScope(
        'utility',
        options.orgId,
      );
      if (!config) {
        return fallback;
      }

      const hasVision = await this._aiModelProvider.modelHasCapability(
        config.providerId,
        config.modelId,
        'vision',
        config.creds,
      );
      if (!hasVision) {
        return fallback;
      }

      const model = await this._aiModelProvider.languageModel(
        'utility',
        options.orgId,
      );
      const result = await (model as any).doGenerate({
        prompt: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text:
                  'You are an image-composition assistant. Given an image, identify the main subject or area of interest and return its normalized center coordinates as JSON: {"x": number, "y": number} where each value is between 0 and 1. Return only the JSON object, no markdown or explanation.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Return the focal point for this image.' },
              { type: 'image', image: imageUrl },
            ],
          },
        ],
      });

      const extractText = (r: any): string =>
        typeof r?.text === 'string'
          ? r.text
          : (Array.isArray(r?.content) ? r.content : [])
              .filter(
                (p: any) => p?.type === 'text' && typeof p.text === 'string',
              )
              .map((p: any) => p.text)
              .join('');

      const text = extractText(result).trim();
      const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (
        typeof parsed?.x === 'number' &&
        typeof parsed?.y === 'number' &&
        !Number.isNaN(parsed.x) &&
        !Number.isNaN(parsed.y)
      ) {
        return {
          x: Math.min(1, Math.max(0, parsed.x)),
          y: Math.min(1, Math.max(0, parsed.y)),
          source: 'provider',
        };
      }
    } catch (err) {
      this._logger.warn(
        `detectFocalPoint failed: ${(err as Error).message}`,
      );
    }

    return fallback;
  }

  // 4F — read-only summary of configured media providers for the user-facing Brand & AI
  // settings panel. Returns one entry per media operation listing the org-enabled
  // providers (by id) whose adapter declares the capability. Never returns credentials.
  async getMediaProviderSummary(orgId?: string): Promise<MediaProviderSummaryEntry[]> {
    const enabled =
      orgId && this._orgMediaProviderSettings
        ? await this._safeGetEnabledProviders(orgId)
        : [];

    return ALL_MEDIA_OPERATIONS.map((operation) => {
      const capability = OPERATION_CAPABILITY[operation];
      const providers = enabled
        .filter((cfg) => {
          const adapter = this._mediaRegistry?.get(cfg.identifier);
          if (!adapter?.capabilities[capability]) return false;
          const ops = cfg.extraConfig.operations;
          return !ops || ops.length === 0 || ops.includes(operation);
        })
        .map((cfg) => ({
          id: cfg.identifier,
          enabled: true,
          c2paAvailable: !!cfg.extraConfig.c2paAvailable,
        }));
      return { operation, available: providers.length > 0, providers };
    });
  }

  private async _safeGetEnabledProviders(orgId: string) {
    try {
      return (await this._orgMediaProviderSettings?.getEnabledProviders(orgId)) || [];
    } catch (err) {
      this._logger.warn(`Could not load media provider configs: ${(err as Error).message}`);
      return [];
    }
  }

  // Capability-driven, deterministic (alphabetical) resolution over the org's enabled +
  // credentialed `MediaProviderConfig` rows. Per-org rows are the single source of
  // truth — the legacy `ragSettings.mediaProviders` blob is gone (plan step 6).
  private async _resolveForOperation(
    orgId: string | undefined,
    operation: MediaOperation,
  ): Promise<ResolvedMediaProvider[]> {
    if (!orgId || !this._orgMediaProviderSettings || !this._mediaRegistry) return [];

    const enabled = await this._safeGetEnabledProviders(orgId);
    const capability = OPERATION_CAPABILITY[operation];
    const resolved: ResolvedMediaProvider[] = [];

    for (const cfg of [...enabled].sort((a, b) => a.identifier.localeCompare(b.identifier))) {
      const adapter = this._mediaRegistry.get(cfg.identifier);
      if (!adapter || !adapter.capabilities[capability]) continue;

      const ops = cfg.extraConfig.operations;
      if (ops && ops.length > 0 && !ops.includes(operation)) continue;

      const full = await this._orgMediaProviderSettings.getConfigForProvider(orgId, cfg.identifier);
      if (!full || Object.keys(full.credentials).length === 0) continue;

      resolved.push({ adapter, credentials: full.credentials });
    }
    return resolved;
  }

  // ── @reaatech/media-pipeline-mcp-cost — per-call cost ledger (§2.4/§6.4) ──
  private async _getCostLedger(): Promise<CostLedgerLike | null> {
    if (this._costLedger !== null) return this._costLedger || null;
    try {
      const { InMemoryCostLedger } = await import('@reaatech/media-pipeline-mcp-cost');
      this._costLedger = new InMemoryCostLedger() as CostLedgerLike;
    } catch (err) {
      this._logger.warn(`media-pipeline-mcp-cost unavailable: ${(err as Error)?.message}`);
      this._costLedger = false;
    }
    return this._costLedger || null;
  }

  // ── @reaatech/media-pipeline-mcp-provenance — C2PA signing (§3.5.20) ──
  // Off unless settings.ragSettings.provenance.enabled with a signing key. Degrades
  // to unsigned output silently when disabled or unavailable (risk register).
  private async _getProvenanceSigner(): Promise<ProvenanceSignerLike | null> {
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
      } as ConstructorParameters<typeof ProvenanceSigner>[0]) as ProvenanceSignerLike;
    } catch (err) {
      this._logger.warn(`media-pipeline-mcp-provenance unavailable: ${(err as Error)?.message}`);
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
      const runId = `media-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
    } catch (err) {
      this._logger.warn(`Provenance signing failed (continuing unsigned): ${(err as Error)?.message}`);
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
          id: `media-${Date.now()}-${randomBytes(3).toString('hex')}`,
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
      } catch (err) {
        this._logger.warn(`Cost ledger charge failed: ${(err as Error)?.message}`);
      }
    }
    return usd;
  }

  // Single funnel for persisting a finished (synchronous) media job with the §2.4/§6.4
  // metadata: real $ cost (-cost), legacy creditType mapping and optional C2PA
  // provenance (-provenance). Async jobs go through MediaJobLifecycleService instead.
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

  // ── Image (synchronous, §10.3/§11.2) ──

  // All image generation routes through the media surface: org-configured image-capable
  // media providers first (standardized result), then the AI facade's imageModel() as a
  // behaviour-preserving fallback for orgs with no image-capable media provider.
  async generateImageResult(
    prompt: string,
    options?: { size?: string; orgId?: string; userId?: string; isVertical?: boolean },
  ): Promise<MediaGenerationResult> {
    const size = options?.size || (options?.isVertical ? '1024x1536' : undefined);
    const candidates = await this._resolveForOperation(options?.orgId, 'image');

    for (const candidate of candidates) {
      try {
        const result = await candidate.adapter.generateImage(prompt, {
          credentials: candidate.credentials,
          size,
        });
        const first = result.image || result.images?.[0];
        if (!first) throw new Error('adapter returned no image');
        await this._persistJob({
          operation: 'image',
          provider: candidate.adapter.identifier,
          model: result.metadata?.model,
          orgId: options?.orgId,
          userId: options?.userId,
          artifactUrl: first,
        });
        return {
          multi: !!result.multi && (result.images?.length || 0) > 1,
          image: first,
          images: result.images?.length ? result.images : [first],
          metadata: result.metadata,
        };
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} image generation failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    // Fallback: the AI provider facade (today's behaviour when no media provider is set).
    const model = await this._aiModelProvider.imageModel('utility', options?.orgId);
    if (!model) {
      throw new CapabilityNotAvailable('Image generation is not available on the current AI provider', 'image');
    }
    const url = await model.generate(prompt, { size });

    await this._persistJob({
      operation: 'image',
      provider: 'ai-media',
      orgId: options?.orgId,
      userId: options?.userId,
      artifactUrl: url,
    });

    return { multi: false, image: url, images: [url] };
  }

  async generateImage(
    prompt: string,
    options?: { size?: string; orgId?: string; userId?: string; isVertical?: boolean },
  ): Promise<string> {
    const result = await this.generateImageResult(prompt, options);
    return result.image || '';
  }

  // ── Async generation (video / audio / avatar, §11.2) ──

  // Starts a tracked async job. Returns the AIMediaJob id (poll `/ai/media-jobs`), or —
  // for providers that complete synchronously — the stored artifact URL.
  private async _startAsyncJob(
    operation: AsyncOperation,
    prompt: string,
    options?: { orgId?: string; userId?: string; sourceUrl?: string; voice?: string },
  ): Promise<string> {
    const candidates = await this._resolveForOperation(options?.orgId, operation);
    if (candidates.length === 0) {
      throw new CapabilityNotAvailable(
        `No media provider with ${operation} capability is configured. Configure one in Settings > Media.`,
        operation === 'audio' ? 'speech' : 'video',
      );
    }

    let lastError: Error | undefined;
    for (const candidate of candidates) {
      const method =
        operation === 'video'
          ? candidate.adapter.generateVideo.bind(candidate.adapter)
          : operation === 'audio'
            ? candidate.adapter.generateAudio.bind(candidate.adapter)
            : candidate.adapter.generateAvatar.bind(candidate.adapter);

      // Tracked path — requires an org (the job ledger is org-scoped) and the lifecycle service.
      if (options?.orgId && this._lifecycle) {
        const costUsd = await this._chargeCost(
          operation,
          candidate.adapter.identifier,
          candidate.adapter.identifier,
          options.orgId,
        );
        const job = await this._lifecycle.createPendingJob({
          organizationId: options.orgId,
          userId: options.userId,
          provider: candidate.adapter.identifier,
          operation,
          costUsd,
          creditType: OPERATION_CREDIT_TYPE[operation],
        });

        try {
          const submission = await method(prompt, {
            credentials: candidate.credentials,
            sourceUrl: options?.sourceUrl,
            voice: options?.voice,
            webhookUrl: this._lifecycle.webhookUrlFor(job.id, options.orgId),
          });

          if (submission.artifactUrl) {
            // Synchronous provider — complete immediately (download + store + notify).
            await this._lifecycle.completeJob(job, submission.artifactUrl, submission.metadata);
            const finished = await this._lifecycle.getJob(job.id);
            return finished?.artifactUrl || job.id;
          }

          await this._lifecycle.attachProviderJob(job.id, submission.jobId);
          return job.id;
        } catch (err) {
          lastError = err as Error;
          this._logger.warn(
            `Media provider ${candidate.adapter.identifier} ${operation} failed: ${lastError.message} — trying next`,
          );
          await this._lifecycle.failJob(job, lastError.message, { notify: false });
        }
        continue;
      }

      // Untracked path (no org context) — submit and return the provider's raw job id.
      try {
        const submission = await method(prompt, {
          credentials: candidate.credentials,
          sourceUrl: options?.sourceUrl,
          voice: options?.voice,
        });
        await this._persistJob({
          operation,
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          userId: options?.userId,
        });
        return submission.artifactUrl || submission.jobId;
      } catch (err) {
        lastError = err as Error;
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} ${operation} failed: ${lastError.message} — trying next`,
        );
      }
    }

    throw new CapabilityNotAvailable(
      `All configured ${operation} providers failed${lastError ? `: ${lastError.message}` : ''}`,
      operation === 'audio' ? 'speech' : 'video',
    );
  }

  async generateVideo(
    prompt: string,
    options?: { orgId?: string; userId?: string; sourceUrl?: string },
  ): Promise<string> {
    try {
      return await this._startAsyncJob('video', prompt, options);
    } catch (err) {
      // Behaviour-preserving fallback: orgs with no video provider get an image instead.
      if (err instanceof CapabilityNotAvailable) {
        this._logger.warn('Video generation not available — falling back to image');
      } else {
        this._logger.error(`Video generation failed: ${(err as Error).message}`);
      }
      const model = await this._aiModelProvider.imageModel('utility', options?.orgId);
      return model.generate(prompt, { size: '1024x1024' });
    }
  }

  generateAudio(
    prompt: string,
    options?: { orgId?: string; userId?: string; voice?: string },
  ): Promise<string> {
    return this._startAsyncJob('audio', prompt, options);
  }

  generateAvatar(
    prompt: string,
    options?: { orgId?: string; userId?: string; sourceUrl?: string },
  ): Promise<string> {
    return this._startAsyncJob('avatar', prompt, options);
  }

  // ── Speech (synchronous) ──

  async textToSpeech(
    text: string,
    options?: { voice?: string; orgId?: string; userId?: string },
  ): Promise<Buffer> {
    const candidates = await this._resolveForOperation(options?.orgId, 'tts');

    for (const candidate of candidates) {
      if (!candidate.adapter.textToSpeech) continue;
      try {
        const result = await candidate.adapter.textToSpeech(text, {
          credentials: candidate.credentials,
          voice: options?.voice,
        });
        await this._persistJob({
          operation: 'tts',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          userId: options?.userId,
        });
        if (Buffer.isBuffer(result)) return result;
        if (typeof result === 'string') return Buffer.from(result, 'base64');
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} TTS failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    throw new CapabilityNotAvailable(
      'Text-to-speech is not available. Configure a TTS-capable media provider (ElevenLabs or OpenAI) in Settings > Media.',
      'speech',
    );
  }

  async speechToText(
    audio: Buffer,
    options?: { orgId?: string; userId?: string },
  ): Promise<string> {
    const candidates = await this._resolveForOperation(options?.orgId, 'stt');

    for (const candidate of candidates) {
      if (!candidate.adapter.speechToText) continue;
      try {
        const text = await candidate.adapter.speechToText(audio, {
          credentials: candidate.credentials,
        });
        await this._persistJob({
          operation: 'stt',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          userId: options?.userId,
        });

        // §11.1: persist the transcript as a document under documents/ (best-effort).
        if (options?.orgId && this._lifecycle) {
          try {
            await this._lifecycle.storeTranscript({
              organizationId: options.orgId,
              provider: candidate.adapter.identifier,
              text,
            });
          } catch (err) {
            this._logger.warn(`Transcript storage failed (non-fatal): ${(err as Error).message}`);
          }
        }

        return text;
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} STT failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    throw new CapabilityNotAvailable(
      'Speech-to-text is not available. Configure an STT-capable media provider (Deepgram or OpenAI) in Settings > Media.',
      'speech',
    );
  }

  async speechToTextWords(
    audio: Buffer,
    options?: { orgId?: string; userId?: string },
  ): Promise<{ text: string; words: { word: string; start: number; end: number }[] }> {
    const candidates = await this._resolveForOperation(options?.orgId, 'stt');

    for (const candidate of candidates) {
      if (!candidate.adapter.speechToTextWords) continue;
      try {
        const result = await candidate.adapter.speechToTextWords(audio, {
          credentials: candidate.credentials,
        });
        await this._persistJob({
          operation: 'stt',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          userId: options?.userId,
        });
        return result;
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} word-level STT failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    // Fallback: use plain STT and split heuristically by duration if word timestamps unavailable.
    const text = await this.speechToText(audio, options);
    const words = text.split(/\s+/).filter(Boolean).map((word, i, arr) => ({
      word,
      start: i / arr.length,
      end: (i + 1) / arr.length,
    }));
    return { text, words };
  }

  // ── Image edits (synchronous) ──

  async upscaleImage(imageUrl: string, options?: { orgId?: string; scale?: number }): Promise<string> {
    const candidates = await this._resolveForOperation(options?.orgId, 'upscale');

    for (const candidate of candidates) {
      if (!candidate.adapter.upscaleImage) continue;
      try {
        const result = await candidate.adapter.upscaleImage(imageUrl, {
          credentials: candidate.credentials,
          scale: options?.scale,
        });
        if (!result) continue;
        const persisted = await this._persistJob({
          operation: 'upscale',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          artifactUrl: result,
        });
        return persisted.artifactUrl || result;
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} upscale failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    this._logger.warn('Upscale not available — returning original');
    return imageUrl;
  }

  async removeBackground(imageUrl: string, options?: { orgId?: string }): Promise<string> {
    const candidates = await this._resolveForOperation(options?.orgId, 'bg-remove');

    for (const candidate of candidates) {
      if (!candidate.adapter.removeBackground) continue;
      try {
        const result = await candidate.adapter.removeBackground(imageUrl, {
          credentials: candidate.credentials,
        });
        if (!result) continue;
        const persisted = await this._persistJob({
          operation: 'bg-remove',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          artifactUrl: result,
        });
        return persisted.artifactUrl || result;
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} bg-remove failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    throw new CapabilityNotAvailable(
      'Background removal is not available. Configure a media provider with image-edit support (Replicate) in Settings > Media.',
      'image_edit',
    );
  }

  async inpaintImage(
    imageUrl: string,
    maskUrl: string,
    prompt: string,
    options?: { orgId?: string },
  ): Promise<string> {
    const candidates = await this._resolveForOperation(options?.orgId, 'inpaint');

    for (const candidate of candidates) {
      if (!candidate.adapter.inpaintImage) continue;
      try {
        const result = await candidate.adapter.inpaintImage(imageUrl, maskUrl, prompt, {
          credentials: candidate.credentials,
        });
        if (!result) continue;
        const persisted = await this._persistJob({
          operation: 'inpaint',
          provider: candidate.adapter.identifier,
          orgId: options?.orgId,
          artifactUrl: result,
        });
        return persisted.artifactUrl || result;
      } catch (err) {
        this._logger.warn(
          `Media provider ${candidate.adapter.identifier} inpaint failed: ${(err as Error).message} — trying next`,
        );
      }
    }

    throw new CapabilityNotAvailable(
      'Inpainting is not available. Configure a media provider with image-edit support (Replicate) in Settings > Media.',
      'image_edit',
    );
  }
}
