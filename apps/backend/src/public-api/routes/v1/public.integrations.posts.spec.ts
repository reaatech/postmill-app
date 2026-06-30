import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({ metrics: { count: vi.fn() } }));
// neutralize the top-level CJS require of file-type
vi.mock('file-type', () => ({ fromBuffer: vi.fn() }));

import { HttpException } from '@nestjs/common';
import { PublicIntegrationsController } from './public.integrations.controller';
import { DefaultNotConfiguredError } from '@gitroom/nestjs-libraries/ai/defaults/ai-defaults.service';

describe('PublicIntegrationsController.getPosts — J2 pagination cap', () => {
  const org = { id: 'org-1' } as any;

  const make = (count: number) => {
    const all = Array.from({ length: count }, (_, i) => ({ id: `p-${i}` }));
    const postsService = { getPosts: vi.fn().mockResolvedValue(all) };
    const ctrl = new (PublicIntegrationsController as any)(
      {}, // integrationService
      postsService,
      {}, // fileService
      {}, // notificationService
      {}, // integrationManager
      {}, // refreshIntegrationService
      {}, // analyticsService
      {}, // storageService
      { checkCredits: vi.fn().mockResolvedValue({ credits: 5 }) }, // subscriptionService
      {}, // aiDefaults
      {} // aiMediaService
    );
    return { ctrl, all };
  };

  const query = (extra: Record<string, any> = {}) =>
    ({ startDate: 'x', endDate: 'y', ...extra }) as any;

  it('caps the default response at max and returns a next cursor', async () => {
    const { ctrl } = make(250);
    const res = await ctrl.getPosts(org, query());
    expect(res.posts).toHaveLength(100);
    expect(res.cursor).toBe(100);
  });

  it('honours limit + cursor and nulls the cursor on the last page', async () => {
    const { ctrl, all } = make(250);
    const res = await ctrl.getPosts(org, query({ limit: 50, cursor: 200 }));
    expect(res.posts).toHaveLength(50);
    expect(res.posts[0].id).toBe(all[200].id);
    expect(res.cursor).toBeNull();
  });

  it('returns all posts (capped) with null cursor when under the cap', async () => {
    const { ctrl, all } = make(12);
    const res = await ctrl.getPosts(org, query());
    expect(res.posts).toEqual(all);
    expect(res.cursor).toBeNull();
  });
});

describe('PublicIntegrationsController.generate-video — legacy public API re-point', () => {
  const org = { id: 'org-1' } as any;

  const make = (overrides: {
    credits?: number;
    textToVideo?: string;
    imageToVideo?: string;
    videoToVideo?: string;
  } = {}) => {
    const subscriptionService = {
      checkCredits: vi.fn().mockResolvedValue({ credits: overrides.credits ?? 5 }),
      // useCredit wraps the generation callback and bills on success — pass through.
      useCredit: vi.fn((_org: any, _type: string, fn: () => Promise<any>) => fn()),
    };
    const aiDefaults = {
      textToVideo: vi.fn().mockResolvedValue(overrides.textToVideo ?? 'job-tts'),
      imageToVideo: vi.fn().mockResolvedValue(overrides.imageToVideo ?? 'job-i2v'),
      videoToVideo: vi.fn().mockResolvedValue(overrides.videoToVideo ?? 'job-v2v'),
    };
    const aiMediaService = {};
    const ctrl = new (PublicIntegrationsController as any)(
      {}, {}, {}, {}, {}, {}, {}, {}, subscriptionService, aiDefaults, aiMediaService
    );
    return { ctrl, subscriptionService, aiDefaults };
  };

  // FROZEN PUBLIC CONTRACT — these assertions guard the documented self-describing,
  // back-compatible response shape that legacy n8n/Zapier clients depend on. The
  // response is { id, status, jobId, path, name, pollUrl }. `path` is the finished
  // video URL ONLY when status === 'completed'; when 'pending' the client must poll
  // `pollUrl`. Do NOT relax these to mirror the implementation — if the shape changes,
  // that is a breaking change to the public API and requires a new versioned route.

  it('PENDING: queued async job returns the documented self-describing shape with a pollUrl', async () => {
    const { ctrl, aiDefaults, subscriptionService } = make({ textToVideo: 'job-123' });
    const res = await ctrl.generateVideo(org, {
      type: 'text-to-video',
      output: 'vertical',
      customParams: { prompt: 'a cat' },
    });
    // Full frozen contract for the queued case.
    expect(res).toEqual({
      id: 'job-123',
      status: 'pending',
      jobId: 'job-123',
      path: '',
      name: '',
      pollUrl: '/public/v1/generate-video/job-123',
    });
    // Guard the load-bearing invariants explicitly (not just deep-equality).
    expect(res.status).toBe('pending');
    expect(res.path).toBe(''); // never a URL while pending
    expect(res.pollUrl).toBe(`/public/v1/generate-video/${res.jobId}`); // poll target is set
    expect(aiDefaults.textToVideo).toHaveBeenCalledWith('org-1', 'a cat');
    // Billing must not regress: legacy consumed an `ai_videos` credit on success.
    expect(subscriptionService.useCredit).toHaveBeenCalledWith(
      org,
      'ai_videos',
      expect.any(Function),
    );
  });

  it('COMPLETED: synchronous URL fallback returns path=URL, status=completed, empty pollUrl', async () => {
    const { ctrl } = make({ textToVideo: 'https://cdn/fallback.png' });
    const res = await ctrl.generateVideo(org, {
      type: 'text-to-video',
      output: 'vertical',
      customParams: { prompt: 'a cat' },
    });
    // Full frozen contract for the synchronous/completed case.
    expect(res).toEqual({
      id: '',
      status: 'completed',
      jobId: '',
      path: 'https://cdn/fallback.png',
      name: '',
      pollUrl: '',
    });
    // Legacy clients read `response.path` as the finished URL — this MUST hold.
    expect(res.status).toBe('completed');
    expect(res.path).toBe('https://cdn/fallback.png');
    expect(res.pollUrl).toBe(''); // nothing to poll when already complete
  });

  it('routes imageUrl to image-to-video (pending contract)', async () => {
    const { ctrl, aiDefaults } = make({ imageToVideo: 'job-i2v' });
    const res = await ctrl.generateVideo(org, {
      type: 'text-to-video',
      output: 'vertical',
      customParams: { prompt: 'a cat', imageUrl: 'https://cdn/frame.png' },
    });
    expect(res).toEqual({
      id: 'job-i2v',
      status: 'pending',
      jobId: 'job-i2v',
      path: '',
      name: '',
      pollUrl: '/public/v1/generate-video/job-i2v',
    });
    expect(aiDefaults.imageToVideo).toHaveBeenCalledWith(
      'org-1',
      'a cat',
      'https://cdn/frame.png',
    );
  });

  it('routes videoUrl to video-to-video (pending contract)', async () => {
    const { ctrl, aiDefaults } = make({ videoToVideo: 'job-v2v' });
    const res = await ctrl.generateVideo(org, {
      type: 'video-to-video',
      output: 'horizontal',
      customParams: { prompt: 'make it cinematic', videoUrl: 'https://cdn/src.mp4' },
    });
    expect(res).toEqual({
      id: 'job-v2v',
      status: 'pending',
      jobId: 'job-v2v',
      path: '',
      name: '',
      pollUrl: '/public/v1/generate-video/job-v2v',
    });
    expect(aiDefaults.videoToVideo).toHaveBeenCalledWith(
      'org-1',
      'make it cinematic',
      'https://cdn/src.mp4',
    );
  });

  // FROZEN PUBLIC CONTRACT — the API-key-reachable poll route for the async job above.
  const makePoll = (job: any) => {
    const aiMediaService = { getJob: vi.fn().mockResolvedValue(job) };
    const ctrl = new (PublicIntegrationsController as any)(
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, aiMediaService
    );
    return { ctrl, aiMediaService };
  };

  it('POLL pending: GET /generate-video/:id returns pending + a pollUrl back to itself', async () => {
    const { ctrl } = makePoll({
      id: 'job-123',
      status: 'pending',
      artifactUrl: '',
      organizationId: 'org-1',
    });
    const res = await ctrl.getGenerateVideoJob(org, 'job-123');
    expect(res).toEqual({
      id: 'job-123',
      status: 'pending',
      jobId: 'job-123',
      path: '',
      name: '',
      pollUrl: '/public/v1/generate-video/job-123',
      error: '',
    });
  });

  it('POLL completed: GET /generate-video/:id returns the finished path and empty pollUrl', async () => {
    const { ctrl } = makePoll({
      id: 'job-123',
      status: 'completed',
      artifactUrl: 'https://cdn/out.mp4',
      organizationId: 'org-1',
    });
    const res = await ctrl.getGenerateVideoJob(org, 'job-123');
    expect(res.status).toBe('completed');
    expect(res.path).toBe('https://cdn/out.mp4'); // legacy clients read .path
    expect(res.pollUrl).toBe('');
  });

  it('POLL failed: GET /generate-video/:id is terminal — empty pollUrl + error, so a poll loop stops', async () => {
    const { ctrl } = makePoll({
      id: 'job-123',
      status: 'failed',
      artifactUrl: '',
      organizationId: 'org-1',
      error: 'provider rejected the prompt',
    });
    const res = await ctrl.getGenerateVideoJob(org, 'job-123');
    expect(res.status).toBe('failed');
    expect(res.path).toBe('');
    expect(res.pollUrl).toBe(''); // terminal — never keep a client polling a dead job
    expect(res.error).toBe('provider rejected the prompt');
  });

  it('POLL is tenant-scoped: a job from another org is 404', async () => {
    const { ctrl } = makePoll({
      id: 'job-x',
      status: 'completed',
      artifactUrl: 'https://cdn/out.mp4',
      organizationId: 'org-OTHER',
    });
    await expect(ctrl.getGenerateVideoJob(org, 'job-x')).rejects.toThrow();
  });

  it('throws 402 when the org has no AI video credits', async () => {
    const { ctrl } = make({ credits: 0 });
    await expect(
      ctrl.generateVideo(org, { type: 'text-to-video', output: 'vertical' }),
    ).rejects.toThrow(expect.objectContaining({ status: 402 }));
  });

  it('maps DefaultNotConfiguredError to a 409 conflict', async () => {
    const { ctrl, aiDefaults } = make();
    aiDefaults.textToVideo.mockRejectedValueOnce(
      new DefaultNotConfiguredError('text-to-video'),
    );
    await expect(
      ctrl.generateVideo(org, { type: 'text-to-video', output: 'vertical' }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 409,
        response: { error: expect.any(String), category: 'text-to-video' },
      }),
    );
  });
});

describe('PublicIntegrationsController.video/function — loadVoices compat', () => {
  const org = { id: 'org-1' } as any;

  const make = () => {
    const aiMediaService = {
      listVoices: vi.fn().mockResolvedValue([
        { id: 'voice-1', label: 'Voice One', previewUrl: 'https://cdn/p1.mp3' },
        { id: 'voice-2', label: 'Voice Two', previewUrl: 'https://cdn/p2.mp3' },
      ]),
    };
    const ctrl = new (PublicIntegrationsController as any)(
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, aiMediaService
    );
    return { ctrl, aiMediaService };
  };

  it('returns exactly { voices: [{ id, name, preview_url }] }', async () => {
    const { ctrl, aiMediaService } = make();
    const res = await ctrl.videoFunction(org, {
      identifier: 'elevenlabs',
      functionName: 'loadVoices',
    });
    expect(aiMediaService.listVoices).toHaveBeenCalledWith('org-1', {
      provider: 'elevenlabs',
    });
    expect(res).toEqual({
      voices: [
        { id: 'voice-1', name: 'Voice One', preview_url: 'https://cdn/p1.mp3' },
        { id: 'voice-2', name: 'Voice Two', preview_url: 'https://cdn/p2.mp3' },
      ],
    });
  });

  it('rejects any function other than loadVoices', async () => {
    const { ctrl } = make();
    await expect(
      ctrl.videoFunction(org, { identifier: 'x', functionName: 'other' }),
    ).rejects.toThrow(expect.objectContaining({ status: 400 }));
  });
});
