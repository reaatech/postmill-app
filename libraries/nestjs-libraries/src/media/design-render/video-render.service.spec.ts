import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VideoRenderService } from './video-render.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  },
}));

describe('VideoRenderService', () => {
  let service: VideoRenderService;
  let lifecycle: MediaJobLifecycleService;
  let aiSettings: AiSettingsService;
  let encoder: FfmpegVideoEncoderService;

  const orgId = 'org-1';

  beforeEach(() => {
    lifecycle = {
      createPendingJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: orgId,
        provider: 'chromium-ffmpeg',
        operation: 'video',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      completeJobWithBuffer: vi.fn().mockResolvedValue(true),
    } as any;

    aiSettings = {
      getMediaJobById: vi.fn().mockResolvedValue({
        id: 'job-1',
        organizationId: orgId,
        provider: 'chromium-ffmpeg',
        operation: 'video',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateMediaJob: vi.fn().mockResolvedValue(undefined),
    } as any;

    encoder = {
      encode: vi.fn(),
      cleanup: vi.fn(),
    } as any;

    service = new VideoRenderService(lifecycle, aiSettings, encoder);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const videoOutput = (durationMs = 5000) => ({
    id: 'vo-1',
    formatId: 'reel',
    name: 'Reel',
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs,
    tracks: [
      {
        id: 't1',
        type: 'image' as const,
        clips: [
          {
            id: 'c1',
            startMs: 0,
            endMs: durationMs,
            x: 0,
            y: 0,
            width: 1080,
            height: 1920,
            src: 'https://example.com/image.png',
          },
        ],
      },
    ],
  });

  it('enqueues a render job and stores the payload in Redis', async () => {
    const composition = videoOutput(5000);
    const result = await service.enqueueRender(orgId, {
      composition,
      bitrateKbps: 4000,
    });

    expect(result.id).toBe('job-1');
    expect(result.status).toBe('pending');
    expect(lifecycle.createPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        provider: 'chromium-ffmpeg',
        operation: 'video',
      }),
    );
    expect(vi.mocked(ioRedis.set)).toHaveBeenCalledWith(
      'video-render:payload:job-1',
      expect.stringContaining('"composition"'),
      'EX',
      24 * 60 * 60,
    );
  });

  it('rejects compositions longer than 60 seconds', async () => {
    await expect(
      service.enqueueRender(orgId, {
        composition: videoOutput(61000),
      }),
    ).rejects.toThrow('exceeds the 60 s hard cap');
  });

  it('processes a pending job and completes it with the rendered artifact', async () => {
    const composition = videoOutput(3000);
    vi.mocked(ioRedis.get).mockResolvedValueOnce(
      JSON.stringify({
        organizationId: orgId,
        composition,
        bitrateKbps: 4000,
      }),
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postmill-test-'));
    const videoPath = path.join(tmpDir, 'output.mp4');
    const thumbPath = path.join(tmpDir, 'thumb.jpg');
    fs.writeFileSync(videoPath, Buffer.from('fake-video'));
    fs.writeFileSync(thumbPath, Buffer.from('fake-thumb'));

    vi.mocked(encoder.encode).mockResolvedValueOnce({
      videoPath,
      thumbnailPath: thumbPath,
    });

    await service.processVideoRender('job-1');

    expect(aiSettings.updateMediaJob).toHaveBeenCalledWith('job-1', {
      status: 'processing',
    });
    expect(encoder.encode).toHaveBeenCalledWith(
      composition,
      expect.objectContaining({ fps: 30, bitrateKbps: 4000, format: 'mp4' }),
    );
    expect(lifecycle.completeJobWithBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      expect.any(Buffer),
      'video/mp4',
      expect.objectContaining({
        width: 1080,
        height: 1920,
        durationSeconds: 3,
        fps: 30,
        provider: 'chromium-ffmpeg',
      }),
      expect.any(Buffer),
    );
    expect(aiSettings.updateMediaJob).not.toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'failed' }),
    );

    encoder.cleanup(tmpDir);
  });

  it('fails the job when no payload is found in Redis', async () => {
    vi.mocked(ioRedis.get).mockResolvedValueOnce(null);

    await service.processVideoRender('job-1');

    expect(aiSettings.updateMediaJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('No pending composition'),
      }),
    );
  });
});
