import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The controller module imports the shared ioRedis client at load time; stub it so
// importing the controller never opens a real Redis connection.
vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: vi.fn(), set: vi.fn(), keys: vi.fn(), del: vi.fn() },
}));

import { HttpStatus } from '@nestjs/common';
import { MediaController } from './media.controller';
// Import from the SAME module the controller catches against so `instanceof` holds.
import { DefaultNotConfiguredError } from '@gitroom/nestjs-libraries/ai/defaults/ai-defaults.service';

const org = { id: 'org-1' } as any;

function build(defaultsOverride: Record<string, any> = {}, credits = 100, budgetAllowed = true) {
  const aiDefaults = {
    imageToImage: vi.fn().mockResolvedValue('https://cdn/out.png'),
    videoUpscale: vi.fn().mockResolvedValue('job-up'),
    videoBackground: vi.fn().mockResolvedValue('job-bg'),
    videoToVideo: vi.fn().mockResolvedValue('job-v2v'),
    textToMusic: vi.fn().mockResolvedValue('job-music'),
    videoAvatar: vi.fn().mockResolvedValue('job-avatar'),
    imageSlide: vi.fn().mockResolvedValue('https://cdn/slide.mp4'),
    ...defaultsOverride,
  };
  const subscription = { checkCredits: vi.fn().mockResolvedValue({ credits }) };
  const budget = { checkBudget: vi.fn().mockResolvedValue({ allowed: budgetAllowed, reason: 'over' }) };
  const controller = new MediaController(
    aiDefaults as any,
    {} as any, // _aiMediaService
    {} as any, // _defaultsResolution
    {} as any, // _fileService
    subscription as any,
    {} as any, // _storageService
    {} as any, // _stockMediaService
    {} as any, // _brandsService
    budget as any
  );
  return { controller, aiDefaults, subscription, budget };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('MediaController — Designer AI-media routes', () => {
  describe('transform family (source asset, no Stripe short-circuit)', () => {
    it('image-to-image delegates (org, prompt, imageUrl) and returns { url }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.imageToImage(org, { imageUrl: 'https://x/a.png', prompt: 'make it blue' } as any);
      expect(aiDefaults.imageToImage).toHaveBeenCalledWith('org-1', 'make it blue', 'https://x/a.png');
      expect(res).toEqual({ url: 'https://cdn/out.png' });
    });

    it('upscale-video delegates (org, videoUrl) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.upscaleVideo(org, { videoUrl: 'https://x/v.mp4' } as any);
      expect(aiDefaults.videoUpscale).toHaveBeenCalledWith('org-1', 'https://x/v.mp4');
      expect(res).toEqual({ id: 'job-up', status: 'pending' });
    });

    it('remove-video-background delegates (org, videoUrl) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.removeVideoBackground(org, { videoUrl: 'https://x/v.mp4' } as any);
      expect(aiDefaults.videoBackground).toHaveBeenCalledWith('org-1', 'https://x/v.mp4');
      expect(res).toEqual({ id: 'job-bg', status: 'pending' });
    });

    it('video-to-video delegates (org, prompt, videoUrl) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.videoToVideo(org, { videoUrl: 'https://x/v.mp4', prompt: 'noir' } as any);
      expect(aiDefaults.videoToVideo).toHaveBeenCalledWith('org-1', 'noir', 'https://x/v.mp4');
      expect(res).toEqual({ id: 'job-v2v', status: 'pending' });
    });

    it('transform routes do NOT short-circuit on zero credits (no Stripe gate)', async () => {
      vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test');
      const { controller, aiDefaults } = build({}, 0);
      const res = await controller.imageToImage(org, { imageUrl: 'https://x/a.png', prompt: 'p' } as any);
      // Unlike the generative family, the transform family still runs at 0 credits.
      expect(aiDefaults.imageToImage).toHaveBeenCalled();
      expect(res).toEqual({ url: 'https://cdn/out.png' });
    });

    it('maps DefaultNotConfiguredError to HTTP 409 CONFLICT', async () => {
      const { controller } = build({
        videoUpscale: vi.fn().mockRejectedValue(new DefaultNotConfiguredError('video-upscale')),
      });
      await expect(
        controller.upscaleVideo(org, { videoUrl: 'https://x/v.mp4' } as any)
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('rejects with HTTP 429 when the media budget is exceeded', async () => {
      const { controller, aiDefaults } = build({}, 100, false);
      await expect(
        controller.imageToImage(org, { imageUrl: 'https://x/a.png', prompt: 'p' } as any)
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(aiDefaults.imageToImage).not.toHaveBeenCalled();
    });
  });

  describe('generative family (Stripe credit short-circuit)', () => {
    it('generate-music delegates (org, prompt) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.generateMusic(org, { prompt: 'lofi beat' } as any);
      expect(aiDefaults.textToMusic).toHaveBeenCalledWith('org-1', 'lofi beat');
      expect(res).toEqual({ id: 'job-music', status: 'pending' });
    });

    it('generate-avatar delegates (org, script, { imageUrl }) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.generateAvatar(org, { script: 'hi there', imageUrl: 'https://x/p.png' } as any);
      expect(aiDefaults.videoAvatar).toHaveBeenCalledWith('org-1', 'hi there', { imageUrl: 'https://x/p.png' });
      expect(res).toEqual({ id: 'job-avatar', status: 'pending' });
    });

    it('generate-slide delegates (org, prompt, imageUrls) and returns { id, status:pending }', async () => {
      const { controller, aiDefaults } = build();
      const res = await controller.generateSlide(org, { prompt: 'trip', imageUrls: ['https://x/1.png'] } as any);
      expect(aiDefaults.imageSlide).toHaveBeenCalledWith('org-1', 'trip', ['https://x/1.png']);
      expect(res).toEqual({ id: 'https://cdn/slide.mp4', status: 'pending' });
    });

    it('returns false (never calls the provider) when Stripe is set and credits are exhausted', async () => {
      vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test');
      const { controller, aiDefaults } = build({}, 0);
      const res = await controller.generateMusic(org, { prompt: 'x' } as any);
      expect(res).toBe(false);
      expect(aiDefaults.textToMusic).not.toHaveBeenCalled();
    });

    it('runs at zero credits when Stripe is NOT configured (self-hosted)', async () => {
      // STRIPE_PUBLISHABLE_KEY unset → no credit gate.
      const { controller, aiDefaults } = build({}, 0);
      const res = await controller.generateMusic(org, { prompt: 'x' } as any);
      expect(aiDefaults.textToMusic).toHaveBeenCalled();
      expect(res).toEqual({ id: 'job-music', status: 'pending' });
    });

    it('maps DefaultNotConfiguredError to HTTP 409 CONFLICT', async () => {
      const { controller } = build({
        imageSlide: vi.fn().mockRejectedValue(new DefaultNotConfiguredError('image-slide')),
      });
      await expect(
        controller.generateSlide(org, { prompt: 'x' } as any)
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });
  });
});
