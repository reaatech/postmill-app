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
    processPendingJobs: vi.fn().mockResolvedValue({ processed: 0, completed: 0, failed: 0 }),
  };
  const aiSettings = {
    getPendingMediaJobs: vi.fn().mockResolvedValue(opts.pending ?? []),
    getMediaJobById: vi.fn(async (id: string) => opts.jobsById?.[id]),
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

  it('re-enqueues pending local renders to media/render (Inngest on) without rendering inline', async () => {
    const { activity, videoRender } = makeActivity({
      pending: [
        { id: 'd1', provider: 'chromium-ffmpeg', model: null },
        { id: 'm1', provider: 'replicate', model: 'local/ffmpeg-merge' },
        { id: 'x1', provider: 'replicate', model: 'something-remote' }, // not a local render
      ],
    });

    await activity.processPendingMediaJobs();

    expect(h.send).toHaveBeenCalledWith({
      name: 'media/render',
      data: { jobId: 'd1', op: 'design' },
    });
    expect(h.send).toHaveBeenCalledWith({
      name: 'media/render',
      data: { jobId: 'm1', op: 'merge' },
    });
    expect(h.send).toHaveBeenCalledTimes(2); // x1 is not a local render
    expect(videoRender.processVideoRender).not.toHaveBeenCalled();
    expect(videoRender.processMergeRender).not.toHaveBeenCalled();
  });

  it('renders inline through the semaphore when Inngest is off', async () => {
    h.enabled = false;
    const { activity, videoRender } = makeActivity({
      pending: [{ id: 'd1', provider: 'chromium-ffmpeg', model: null }],
      jobsById: { d1: { id: 'd1', provider: 'chromium-ffmpeg', model: null } },
    });

    await activity.processPendingMediaJobs();

    expect(h.send).not.toHaveBeenCalled();
    expect(videoRender.processVideoRender).toHaveBeenCalledWith('d1');
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
