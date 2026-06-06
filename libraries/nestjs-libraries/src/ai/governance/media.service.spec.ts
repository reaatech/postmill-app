import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapabilityNotAvailable } from './errors';

const mockImageModelGenerate = vi.fn().mockResolvedValue('https://cdn.example.com/image.png');
const mockImageModel = vi.fn().mockResolvedValue({
  generate: mockImageModelGenerate,
});

vi.mock('@gitroom/nestjs-libraries/ai/ai-model.provider', () => ({
  AIModelProvider: class MockProvider {
    imageModel = mockImageModel;
  },
}));

const mockCreateMediaJob = vi.fn().mockResolvedValue(undefined);
const mockGetProviderConfigs = vi.fn().mockResolvedValue([]);

vi.mock('@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service', () => ({
  AiSettingsService: class MockAiSettings {
    createMediaJob = mockCreateMediaJob;
    getProviderConfigs = mockGetProviderConfigs;
  },
}));

vi.mock('@gitroom/helpers/auth/auth.service', () => ({
  AuthService: {
    fixedDecryption: vi.fn().mockReturnValue(JSON.stringify({ apiKey: 'test-key' })),
  },
}));

const mockGetSettings = vi.fn().mockResolvedValue(null);

vi.mock('@gitroom/nestjs-libraries/ai/ai-settings.manager', () => ({
  AiSettingsManager: class MockManager {
    getSettings = mockGetSettings;
  },
}));

// Mock media pipeline providers
const mockReplicateExecute = vi.fn().mockResolvedValue({ output: { uri: 'https://replicate.example.com/result.png' } });
const mockOpenAIExecute = vi.fn().mockResolvedValue({ output: { data: Buffer.from('fake-audio'), text: 'openai transcript' } });
const mockElevenLabsExecute = vi.fn().mockResolvedValue({ output: { data: Buffer.from('fake-tts') } });
const mockDeepgramExecute = vi.fn().mockResolvedValue({ output: { text: 'transcribed text' } });
const mockLumaExecute = vi.fn().mockResolvedValue({ output: { uri: 'https://luma.example.com/video.mp4' } });

vi.mock('@reaatech/media-pipeline-mcp-replicate', () => ({
  defineReplicateProvider: vi.fn(() => ({
    execute: mockReplicateExecute,
  })),
}));

vi.mock('@reaatech/media-pipeline-mcp-openai', () => ({
  defineOpenAIProvider: vi.fn(() => ({
    execute: mockOpenAIExecute,
  })),
}));

vi.mock('@reaatech/media-pipeline-mcp-elevenlabs', () => ({
  defineElevenLabsProvider: vi.fn(() => ({
    execute: mockElevenLabsExecute,
  })),
}));

vi.mock('@reaatech/media-pipeline-mcp-deepgram', () => ({
  defineDeepgramProvider: vi.fn(() => ({
    execute: mockDeepgramExecute,
  })),
}));

vi.mock('@reaatech/media-pipeline-mcp-luma', () => ({
  LumaProvider: class MockLuma {
    constructor(_config?: any) {}
    execute = mockLumaExecute;
  },
}));

// ── media-pipeline infra packages (§2.4) ──
const mockCharge = vi.fn().mockResolvedValue(undefined);
vi.mock('@reaatech/media-pipeline-mcp-cost', () => ({
  InMemoryCostLedger: class MockLedger {
    charge = mockCharge;
  },
}));

const mockSign = vi.fn().mockResolvedValue({ signedArtifactId: 'signed-1', manifestUri: 'c2pa:manifest-1' });
vi.mock('@reaatech/media-pipeline-mcp-provenance', () => ({
  ProvenanceSigner: class MockSigner {
    constructor(_config?: any) {}
    sign = mockSign;
  },
}));

const mockStoragePut = vi.fn().mockResolvedValue('stored://artifact-1');
vi.mock('@reaatech/media-pipeline-mcp-storage', () => ({
  createStorage: vi.fn(() => ({ put: mockStoragePut })),
}));

import { AiMediaService } from './media.service';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';

function createService() {
  return new AiMediaService(
    new (AiSettingsService as any)(),
    new (AIModelProvider as any)(),
    new (AiSettingsManager as any)(),
  );
}

function enableMediaProvider(providerId: string, operations: string[], _credentials?: Record<string, string>) {
  mockGetSettings.mockResolvedValue({
    ragSettings: {
      mediaProviders: {
        [providerId]: {
          enabled: true,
          operations,
          c2paAvailable: false,
        },
      },
    },
  });
}

describe('AiMediaService', () => {
  let service: AiMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImageModelGenerate.mockResolvedValue('https://cdn.example.com/image.png');
    mockGetSettings.mockResolvedValue(null);
    mockGetProviderConfigs.mockResolvedValue([]);
    service = createService();
  });

  describe('generateImage', () => {
    it('returns an image URL string', async () => {
      const result = await service.generateImage('a cat wearing a hat');
      expect(typeof result).toBe('string');
      expect(result).toBe('https://cdn.example.com/image.png');
    });

    it('calls the image model with the prompt', async () => {
      await service.generateImage('a cat wearing a hat');
      expect(mockImageModel).toHaveBeenCalledWith('utility', undefined);
      expect(mockImageModelGenerate).toHaveBeenCalledWith('a cat wearing a hat', { size: undefined });
    });

    it('passes size option to the model', async () => {
      await service.generateImage('a cat', { size: '512x512' });
      expect(mockImageModelGenerate).toHaveBeenCalledWith('a cat', { size: '512x512' });
    });

    it('records a media job with cost + creditType when orgId is provided', async () => {
      await service.generateImage('a cat', { orgId: 'org-123', userId: 'user-1' });
      expect(mockCreateMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          userId: 'user-1',
          provider: 'ai-media',
          operation: 'image',
          status: 'done',
          artifactUrl: 'https://cdn.example.com/image.png',
          // §6.4: image maps onto the legacy ai_images credit counter
          creditType: 'ai_images',
        }),
      );
      const job = mockCreateMediaJob.mock.calls[0][0];
      expect(typeof job.costUsd).toBe('number');
      expect(job.costUsd).toBeGreaterThan(0);
      // -cost ledger was charged
      expect(mockCharge).toHaveBeenCalled();
    });

    it('does not sign provenance when signing is disabled', async () => {
      await service.generateImage('a cat', { orgId: 'org-123' });
      const job = mockCreateMediaJob.mock.calls[0][0];
      expect(job.provenance).toBeUndefined();
      expect(mockSign).not.toHaveBeenCalled();
    });

    it('signs C2PA provenance when enabled in settings', async () => {
      mockGetSettings.mockResolvedValue({
        ragSettings: {
          provenance: {
            enabled: true,
            signingKey: { source: { kind: 'pem-inline', privateKey: 'k', certificate: 'c' }, algorithm: 'es256' },
          },
        },
      });
      const fresh = createService();
      await fresh.generateImage('a cat', { orgId: 'org-123' });
      expect(mockSign).toHaveBeenCalled();
      const job = mockCreateMediaJob.mock.calls[0][0];
      expect(job.provenance).toBe('c2pa:manifest-1');
    });

    it('does not record a media job when orgId is not provided', async () => {
      await service.generateImage('a cat');
      expect(mockCreateMediaJob).not.toHaveBeenCalled();
    });

    it('throws CapabilityNotAvailable when image model is null', async () => {
      mockImageModel.mockResolvedValueOnce(null);
      await expect(service.generateImage('a cat')).rejects.toThrow(CapabilityNotAvailable);
    });

    it('passes through the model error when generate fails', async () => {
      mockImageModelGenerate.mockRejectedValueOnce(new Error('API rate limit exceeded'));
      await expect(service.generateImage('a cat')).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('generateVideo', () => {
    it('falls back to image generation when no media provider configured', async () => {
      const result = await service.generateVideo('a sunset');
      expect(result).toBe('https://cdn.example.com/image.png');
      expect(mockImageModel).toHaveBeenCalledWith('utility', undefined);
    });

    it('passes orgId through to image model', async () => {
      await service.generateVideo('a sunset', { orgId: 'org-789', userId: 'user-2' });
      expect(mockImageModel).toHaveBeenCalledWith('utility', 'org-789');
    });

    it('falls back to image when luma is not enabled', async () => {
      enableMediaProvider('luma', []);
      const result = await service.generateVideo('a sunset');
      expect(result).toBe('https://cdn.example.com/image.png');
    });
  });

  describe('textToSpeech', () => {
    it('throws CapabilityNotAvailable when no TTS provider configured', async () => {
      await expect(service.textToSpeech('hello world')).rejects.toThrow(CapabilityNotAvailable);
      await expect(service.textToSpeech('hello world')).rejects.toThrow(
        'Text-to-speech is not available',
      );
    });

    it('throws CapabilityNotAvailable with options', async () => {
      await expect(
        service.textToSpeech('hello', { voice: 'alloy', orgId: 'org-1' }),
      ).rejects.toThrow(CapabilityNotAvailable);
    });
  });

  describe('speechToText', () => {
    it('throws CapabilityNotAvailable when no STT provider configured', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      await expect(service.speechToText(audioBuffer)).rejects.toThrow(CapabilityNotAvailable);
    });

    it('throws CapabilityNotAvailable with options', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      await expect(
        service.speechToText(audioBuffer, { orgId: 'org-1' }),
      ).rejects.toThrow(CapabilityNotAvailable);
    });
  });

  describe('upscaleImage', () => {
    it('returns the original image URL when no upscale provider configured', async () => {
      const url = 'https://cdn.example.com/low-res.png';
      const result = await service.upscaleImage(url);
      expect(result).toBe(url);
    });

    it('returns the original URL even with orgId provided', async () => {
      const url = 'https://cdn.example.com/low-res.png';
      const result = await service.upscaleImage(url, { orgId: 'org-1' });
      expect(result).toBe(url);
    });

    it('returns the original URL for empty string', async () => {
      const result = await service.upscaleImage('');
      expect(result).toBe('');
    });
  });

  describe('removeBackground', () => {
    it('throws CapabilityNotAvailable when no provider configured', async () => {
      await expect(service.removeBackground('https://example.com/img.png')).rejects.toThrow(
        CapabilityNotAvailable,
      );
    });

    it('throws regardless of options', async () => {
      await expect(
        service.removeBackground('https://example.com/img.png', { orgId: 'org-1' }),
      ).rejects.toThrow('Background removal is not available');
    });
  });

  describe('inpaintImage', () => {
    it('throws CapabilityNotAvailable when no provider configured', async () => {
      await expect(
        service.inpaintImage('https://example.com/img.png', 'https://example.com/mask.png', 'fill gap'),
      ).rejects.toThrow(CapabilityNotAvailable);
    });

    it('throws regardless of options', async () => {
      await expect(
        service.inpaintImage('img.png', 'mask.png', 'fill', { orgId: 'org-1' }),
      ).rejects.toThrow('Inpainting is not available');
    });
  });

  describe('with mock media pipeline providers', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockImageModelGenerate.mockResolvedValue('https://cdn.example.com/image.png');
      mockGetSettings.mockResolvedValue(null);
      mockGetProviderConfigs.mockResolvedValue([]);
      mockReplicateExecute.mockResolvedValue({ output: { uri: 'https://replicate.example.com/result.png' } });
      mockOpenAIExecute.mockResolvedValue({ output: { data: Buffer.from('fake-audio'), text: 'openai transcript' } });
      mockElevenLabsExecute.mockResolvedValue({ output: { data: Buffer.from('fake-tts') } });
      mockDeepgramExecute.mockResolvedValue({ output: { text: 'transcribed text' } });
      mockLumaExecute.mockResolvedValue({ output: { uri: 'https://luma.example.com/video.mp4' } });
    });

    describe('textToSpeech with provider', () => {
      it('uses ElevenLabs when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'elevenlabs', credentials: 'encrypted-elevenlabs-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              elevenlabs: { enabled: true, operations: ['tts'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        await freshService.textToSpeech('hello', { voice: 'adam' });
        expect(mockElevenLabsExecute).toHaveBeenCalledWith(
          expect.objectContaining({ operation: 'audio.tts' }),
        );
      });

      it('uses OpenAI TTS when ElevenLabs not configured', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'openai', credentials: 'encrypted-openai-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              openai: { enabled: true, operations: ['tts'], c2paAvailable: false },
            },
          },
        });

        mockElevenLabsExecute.mockRejectedValueOnce(new Error('elevenlabs down'));

        const freshService = createService();
        await freshService.textToSpeech('hello');
        expect(mockOpenAIExecute).toHaveBeenCalledWith(
          expect.objectContaining({ operation: 'audio.tts' }),
        );
      });
    });

    describe('speechToText with provider', () => {
      it('uses Deepgram when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'deepgram', credentials: 'encrypted-deepgram-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              deepgram: { enabled: true, operations: ['stt'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        await freshService.speechToText(Buffer.from('audio'));
        expect(mockDeepgramExecute).toHaveBeenCalledWith(
          expect.objectContaining({ operation: 'audio.stt' }),
        );
      });

      it('uses OpenAI STT when Deepgram not configured', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'openai', credentials: 'encrypted-openai-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              openai: { enabled: true, operations: ['stt'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        const result = await freshService.speechToText(Buffer.from('audio'));
        expect(result).toBe('openai transcript');
      });
    });

    describe('generateVideo with Luma', () => {
      it('uses Luma when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'luma', credentials: 'encrypted-luma-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              luma: { enabled: true, operations: ['video'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        freshService.invalidateProviderCache();
        const result = await freshService.generateVideo('a beautiful sunset');
        expect(result).toBe('https://luma.example.com/video.mp4');
      });

      it('records a video job mapped to the ai_videos credit counter (§6.4)', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'luma', credentials: 'encrypted-luma-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              luma: { enabled: true, operations: ['video'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        freshService.invalidateProviderCache();
        await freshService.generateVideo('a beautiful sunset', { orgId: 'org-9', userId: 'u-9' });
        expect(mockCreateMediaJob).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-9',
            operation: 'video',
            creditType: 'ai_videos',
          }),
        );
      });

      it('falls back to image when luma execution fails', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'luma', credentials: 'encrypted-luma-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              luma: { enabled: true, operations: ['video'], c2paAvailable: false },
            },
          },
        });

        mockLumaExecute.mockRejectedValueOnce(new Error('Luma API error'));

        const freshService = createService();
        freshService.invalidateProviderCache();
        const result = await freshService.generateVideo('a beautiful sunset');
        expect(result).toBe('https://cdn.example.com/image.png');
      });
    });

    describe('upscaleImage with provider', () => {
      it('uses Replicate when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'replicate', credentials: 'encrypted-replicate-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              replicate: { enabled: true, operations: ['upscale'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        freshService.invalidateProviderCache();
        const result = await freshService.upscaleImage('https://img.example.com/low-res.png');
        expect(result).toBe('https://replicate.example.com/result.png');
      });

      it('returns original when replicate fails', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'replicate', credentials: 'encrypted-replicate-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              replicate: { enabled: true, operations: ['upscale'], c2paAvailable: false },
            },
          },
        });

        mockReplicateExecute.mockRejectedValueOnce(new Error('Upscale failed'));

        const freshService = createService();
        freshService.invalidateProviderCache();
        const url = 'https://img.example.com/low-res.png';
        const result = await freshService.upscaleImage(url);
        expect(result).toBe(url);
      });
    });

    describe('removeBackground with provider', () => {
      it('uses Replicate when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'replicate', credentials: 'encrypted-replicate-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              replicate: { enabled: true, operations: ['bg-remove'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        freshService.invalidateProviderCache();
        const result = await freshService.removeBackground('https://img.example.com/photo.png');
        expect(result).toBe('https://replicate.example.com/result.png');
      });
    });

    describe('inpaintImage with provider', () => {
      it('uses Replicate when configured and enabled', async () => {
        mockGetProviderConfigs.mockResolvedValue([
          { identifier: 'replicate', credentials: 'encrypted-replicate-key' },
        ]);
        mockGetSettings.mockResolvedValue({
          ragSettings: {
            mediaProviders: {
              replicate: { enabled: true, operations: ['inpaint'], c2paAvailable: false },
            },
          },
        });

        const freshService = createService();
        freshService.invalidateProviderCache();
        const result = await freshService.inpaintImage('photo.png', 'mask.png', 'fill sky');
        expect(result).toBe('https://replicate.example.com/result.png');
      });
    });

    describe('invalidateProviderCache', () => {
      it('clears provider and config caches', () => {
        const freshService = createService();
        expect(() => freshService.invalidateProviderCache()).not.toThrow();
      });
    });
  });
});
