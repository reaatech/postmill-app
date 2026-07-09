import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ enabled: true, send: vi.fn() }));

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: { send: (...args: any[]) => h.send(...args) },
  isInngestEnabled: () => h.enabled,
}));

import { MediaJobsActivity } from './media-jobs.activity';

function makeActivity(opts: {
  pending?: any[];
  jobsById?: Record<string, any>;
}) {
  const lifecycle = {
    reclaimStaleLandingJobs: vi.fn().mockResolvedValue(0),
    processJob: vi.fn().mockResolvedValue('pending'),
  };
  const aiSettings = {
    getPendingMediaJobs: vi.fn().mockResolvedValue(opts.pending ?? []),
    getMediaJobById: vi.fn(async (_orgId: string, id: string) => opts.jobsById?.[id]),
    getMediaJobByIdUnscoped: vi.fn(async (id: string) => opts.jobsById?.[id]),
  };
  const videoRender = {
    processVideoRender: vi.fn().mockResolvedValue(undefined),
    processMergeRender: vi.fn().mockResolvedValue(undefined),
  };
  const activity = new MediaJobsActivity(
    lifecycle as any,
    aiSettings as any,
    videoRender as any,
  );
  return { activity, lifecycle, aiSettings, videoRender };
}

describe('MediaJobsActivity', () => {
  beforeEach(() => {
    h.enabled = true;
    h.send.mockReset();
  });

  it('reclaims stale landing jobs at the start of the sweep', async () => {
    const { activity, lifecycle } = makeActivity({ pending: [] });

    await activity.processPendingMediaJobs();

    expect(lifecycle.reclaimStaleLandingJobs).toHaveBeenCalled();
  });

  it('fans out one media/poll-job event per non-local pending job', async () => {
    const { activity, lifecycle, videoRender } = makeActivity({
      pending: [
        { id: 'p1', provider: 'replicate', model: 'video' },
        { id: 'p2', provider: 'fal', model: 'image' },
        { id: 'd1', provider: 'chromium-ffmpeg', model: null, updatedAt: new Date(Date.now() - 5_000) },
      ],
    });

    await activity.processPendingMediaJobs();

    const bucket = Math.floor(Date.now() / 60000);
    expect(h.send).toHaveBeenCalledWith({
      name: 'media/poll-job',
      id: `media-poll-p1-${bucket}`,
      data: { jobId: 'p1' },
    });
    expect(h.send).toHaveBeenCalledWith({
      name: 'media/poll-job',
      id: `media-poll-p2-${bucket}`,
      data: { jobId: 'p2' },
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lifecycle.processJob).not.toHaveBeenCalled();
    expect(videoRender.processVideoRender).not.toHaveBeenCalled();
  });

  it('re-enqueues only STALE pending local renders, leaving freshly-queued ones alone', async () => {
    const now = Date.now();
    const { activity } = makeActivity({
      pending: [
        { id: 'fresh', provider: 'chromium-ffmpeg', model: null, updatedAt: new Date(now - 5_000) },
        { id: 'stale', provider: 'chromium-ffmpeg', model: null, updatedAt: new Date(now - 300_000) },
      ],
    });

    await activity.processPendingMediaJobs();

    const bucket = Math.floor(Date.now() / 60000);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith({
      name: 'media/render',
      id: `media-render-stale-${bucket}`,
      data: { jobId: 'stale', op: 'design' },
    });
  });

  it('re-enqueues stale merge jobs with the merge op', async () => {
    const { activity } = makeActivity({
      pending: [
        { id: 'm1', provider: 'replicate', model: 'local/ffmpeg-merge', updatedAt: new Date(Date.now() - 300_000) },
      ],
    });

    await activity.processPendingMediaJobs();

    const bucket = Math.floor(Date.now() / 60000);
    expect(h.send).toHaveBeenCalledWith({
      name: 'media/render',
      id: `media-render-m1-${bucket}`,
      data: { jobId: 'm1', op: 'merge' },
    });
  });

  it('does not send events when Inngest is disabled (inline fallback counted as processed)', async () => {
    h.enabled = false;
    const { activity, videoRender } = makeActivity({
      pending: [{ id: 'd1', provider: 'chromium-ffmpeg', model: null, updatedAt: new Date(Date.now() - 300_000) }],
      jobsById: { d1: { id: 'd1', provider: 'chromium-ffmpeg', model: null } },
    });

    const result = await activity.processPendingMediaJobs();

    expect(h.send).not.toHaveBeenCalled();
    expect(videoRender.processVideoRender).toHaveBeenCalledWith('d1');
    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
  });

  it('bounds inline local renders with a per-job timeout', async () => {
    h.enabled = false;
    const { activity, videoRender } = makeActivity({
      pending: [{ id: 'd1', provider: 'chromium-ffmpeg', model: null, updatedAt: new Date(Date.now() - 300_000) }],
      jobsById: { d1: { id: 'd1', provider: 'chromium-ffmpeg', model: null } },
    });
    vi.mocked(videoRender.processVideoRender).mockImplementation(
      () => new Promise(() => {})
    );
    (activity as any)._inlineRenderTimeoutMs = 50;

    const result = await activity.processPendingMediaJobs();

    expect(result.processed).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('processPollJob delegates to lifecycle.processJob', async () => {
    const { activity, lifecycle } = makeActivity({});

    await activity.processPollJob('job-1');

    expect(lifecycle.processJob).toHaveBeenCalledWith('job-1');
  });

  it('processRenderJob dispatches design vs merge by job shape', async () => {
    const { activity, videoRender } = makeActivity({
      jobsById: {
        d1: { id: 'd1', provider: 'chromium-ffmpeg', model: null },
        m1: { id: 'm1', provider: 'replicate', model: 'local/ffmpeg-merge' },
      },
    });

    await activity.processRenderJob('d1');
    await activity.processRenderJob('m1');

    expect(videoRender.processVideoRender).toHaveBeenCalledWith('d1');
    expect(videoRender.processMergeRender).toHaveBeenCalledWith('m1');
  });
});
