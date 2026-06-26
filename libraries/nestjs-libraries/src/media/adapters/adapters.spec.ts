import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSafeFetch = vi.fn();
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => mockSafeFetch(url, init),
}));

import { FalAdapter } from './fal.adapter';
import { RunwayAdapter } from './runway.adapter';
import { StabilityAdapter } from './stability.adapter';
import { TavusAdapter } from './tavus.adapter';
import { DIDAdapter } from './did.adapter';
import { HedraAdapter } from './hedra.adapter';
import { MiniMaxMediaAdapter } from './minimax-media.adapter';
import { VertexMediaAdapter } from './vertex-media.adapter';
import { BlackForestLabsAdapter } from './black-forest-labs.adapter';
import { OpenaiMediaAdapter } from './openai-media.adapter';
import { ReplicateMediaAdapter } from './replicate.adapter';
import { LumaAdapter } from './luma.adapter';
import { HeyGenAdapter } from './heygen.adapter';
import { ElevenLabsAdapter } from './elevenlabs.adapter';
import { DeepgramAdapter } from './deepgram.adapter';
import { QwenMediaAdapter } from './qwen-media.adapter';
import { resolveApiKey } from '../media-provider-adapter.interface';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
}

const CREDS = { credentials: { apiKey: 'test-key' } };

beforeEach(() => {
  mockSafeFetch.mockReset();
});

describe('resolveApiKey', () => {
  it('resolves from apiKey, then credentials.apiKey/key/token', () => {
    expect(resolveApiKey({ apiKey: 'a' })).toBe('a');
    expect(resolveApiKey({ credentials: { apiKey: 'b' } })).toBe('b');
    expect(resolveApiKey({ credentials: { key: 'c' } })).toBe('c');
    expect(resolveApiKey({ credentials: { token: 'd' } })).toBe('d');
    expect(resolveApiKey({})).toBeUndefined();
  });
});

describe('FalAdapter', () => {
  const adapter = new FalAdapter();

  it('generates images synchronously via fal.run', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ images: [{ url: 'https://fal/img.png', width: 1024, height: 768 }], seed: 7 }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://fal.run/fal-ai/flux/schnell');
    expect(result).toMatchObject({ multi: false, image: 'https://fal/img.png' });
    expect(result.metadata).toMatchObject({ seed: 7, width: 1024, height: 768 });
  });

  it('submits video jobs to the queue with the webhook URL and encodes the model into the job id', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ request_id: 'req-1' }));
    const result = await adapter.generateVideo('a sunset', {
      ...CREDS,
      webhookUrl: 'https://api.example.com/media-jobs/webhook/j/t',
    });
    const url = mockSafeFetch.mock.calls[0][0] as string;
    expect(url).toContain('https://queue.fal.run/fal-ai/kling-video');
    expect(url).toContain('fal_webhook=');
    expect(result.jobId).toBe('fal-ai/kling-video/v1.6/standard/text-to-video::req-1');
  });

  it('polls the queue status and fetches the result on completion', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse({ video: { url: 'https://fal/out.mp4' } }));
    const poll = await adapter.pollJob('some/model::req-1', CREDS);
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://queue.fal.run/some/model/requests/req-1/status');
    expect(poll).toMatchObject({ status: 'completed', artifactUrl: 'https://fal/out.mp4' });
  });

  it('reports pending and failed states', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' }));
    expect((await adapter.pollJob('m::r', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'FAILED', error: 'boom' }));
    expect(await adapter.pollJob('m::r', CREDS)).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('requires an API key', async () => {
    await expect(adapter.generateVideo('x', {})).rejects.toThrow('API key');
  });
});

describe('RunwayAdapter', () => {
  const adapter = new RunwayAdapter();

  it('submits image_to_video tasks and returns the task id', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ id: 'task-1' }));
    const result = await adapter.generateVideo('pan left', { ...CREDS, sourceUrl: 'https://img/src.png' });
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://api.dev.runwayml.com/v1/image_to_video');
    const init = mockSafeFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Runway-Version']).toBe('2024-11-06');
    expect(result.jobId).toBe('task-1');
  });

  it('requires a source image for video', async () => {
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('source image');
  });

  it('polls task status', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'SUCCEEDED', output: ['https://r/out.mp4'] }));
    expect(await adapter.pollJob('task-1', CREDS)).toMatchObject({
      status: 'completed',
      artifactUrl: 'https://r/out.mp4',
    });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'RUNNING' }));
    expect((await adapter.pollJob('task-1', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'FAILED', failure: 'bad input' }));
    expect(await adapter.pollJob('task-1', CREDS)).toMatchObject({ status: 'failed', error: 'bad input' });
  });
});

describe('StabilityAdapter', () => {
  const adapter = new StabilityAdapter();

  it('generates images synchronously as data URIs with seed metadata', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ image: 'QUJD', seed: 42 }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(result.image).toBe('data:image/png;base64,QUJD');
    expect(result.metadata?.seed).toBe(42);
  });

  it('returns inline audio submissions (synchronous provider)', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ audio: 'QUJD' }));
    const result = await adapter.generateAudio('a jingle', CREDS);
    expect(result.artifactUrl).toBe('data:audio/mpeg;base64,QUJD');
  });

  it('polls image-to-video results (202 = pending, json = completed)', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ...jsonResponse({}), status: 202, ok: false });
    expect((await adapter.pollJob('vid-1', CREDS)).status).toBe('pending');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ video: 'QUJD' }));
    expect(await adapter.pollJob('vid-1', CREDS)).toMatchObject({
      status: 'completed',
      artifactUrl: 'data:video/mp4;base64,QUJD',
    });
  });
});

describe('TavusAdapter', () => {
  const adapter = new TavusAdapter();

  it('submits avatar videos with replica id and callback', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ video_id: 'v-1' }));
    const result = await adapter.generateAvatar('hello', { ...CREDS, avatarId: 'rep-1', webhookUrl: 'https://cb' });
    const body = JSON.parse((mockSafeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ replica_id: 'rep-1', script: 'hello', callback_url: 'https://cb' });
    expect(result.jobId).toBe('v-1');
  });

  it('requires a replica id', async () => {
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('replica id');
  });

  it('polls video status', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'ready', download_url: 'https://t/out.mp4' }));
    expect(await adapter.pollJob('v-1', CREDS)).toMatchObject({ status: 'completed', artifactUrl: 'https://t/out.mp4' });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'generating' }));
    expect((await adapter.pollJob('v-1', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'error', error: 'no replica' }));
    expect(await adapter.pollJob('v-1', CREDS)).toMatchObject({ status: 'failed' });
  });
});

describe('DIDAdapter', () => {
  const adapter = new DIDAdapter();

  it('submits talks with a source image', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ id: 'talk-1' }));
    const result = await adapter.generateAvatar('hi', { ...CREDS, sourceUrl: 'https://img/face.png' });
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://api.d-id.com/talks');
    expect(result.jobId).toBe('talk-1');
  });

  it('requires a source image', async () => {
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('source image');
  });

  it('polls talk status', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'done', result_url: 'https://d/out.mp4' }));
    expect(await adapter.pollJob('talk-1', CREDS)).toMatchObject({ status: 'completed', artifactUrl: 'https://d/out.mp4' });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'started' }));
    expect((await adapter.pollJob('talk-1', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'error', error: { description: 'bad face' } }));
    expect(await adapter.pollJob('talk-1', CREDS)).toMatchObject({ status: 'failed', error: 'bad face' });
  });
});

describe('HedraAdapter', () => {
  const adapter = new HedraAdapter();

  it('submits generations and polls status', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ id: 'gen-1' }));
    const result = await adapter.generateVideo('long form', CREDS);
    expect(result.jobId).toBe('gen-1');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'complete', url: 'https://h/out.mp4' }));
    expect(await adapter.pollJob('gen-1', CREDS)).toMatchObject({ status: 'completed', artifactUrl: 'https://h/out.mp4' });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'processing' }));
    expect((await adapter.pollJob('gen-1', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'error', error_message: 'gpu fire' }));
    expect(await adapter.pollJob('gen-1', CREDS)).toMatchObject({ status: 'failed', error: 'gpu fire' });
  });
});

describe('MiniMaxMediaAdapter', () => {
  const adapter = new MiniMaxMediaAdapter();

  it('generates images synchronously', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ data: { image_urls: ['https://mm/1.png', 'https://mm/2.png'] } }));
    const result = await adapter.generateImage('two cats', CREDS);
    expect(result).toMatchObject({ multi: true, image: 'https://mm/1.png' });
    expect(result.images).toHaveLength(2);
  });

  it('submits video tasks', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ task_id: 'task-9' }));
    const result = await adapter.generateVideo('a sunset', CREDS);
    expect(result.jobId).toBe('task-9');
  });

  it('returns inline audio (hex → base64 data URI)', async () => {
    const hex = Buffer.from('mp3data').toString('hex');
    mockSafeFetch.mockResolvedValue(jsonResponse({ data: { audio: hex } }));
    const result = await adapter.generateAudio('a jingle', CREDS);
    expect(result.artifactUrl).toBe(`data:audio/mpeg;base64,${Buffer.from('mp3data').toString('base64')}`);
  });

  it('polls video status and resolves the file download URL', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'Success', file_id: 'f-1' }))
      .mockResolvedValueOnce(jsonResponse({ file: { download_url: 'https://mm/out.mp4' } }));
    expect(await adapter.pollJob('task-9', CREDS)).toMatchObject({
      status: 'completed',
      artifactUrl: 'https://mm/out.mp4',
    });

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'Processing' }));
    expect((await adapter.pollJob('task-9', CREDS)).status).toBe('pending');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'Fail', base_resp: { status_msg: 'quota' } }));
    expect(await adapter.pollJob('task-9', CREDS)).toMatchObject({ status: 'failed', error: 'quota' });
  });
});

describe('VertexMediaAdapter', () => {
  const adapter = new VertexMediaAdapter();
  const vertexCreds = { credentials: { accessToken: 'tok', projectId: 'proj', region: 'us-central1' } };

  it('requires a project id', async () => {
    await expect(adapter.generateImage('x', CREDS)).rejects.toThrow('project');
  });

  it('requires a service account JSON or access token when project is set', async () => {
    await expect(
      adapter.generateImage('x', { credentials: { project: 'proj' } }),
    ).rejects.toThrow('service account');
  });

  it('exposes the GCP credential fields for the settings modal', () => {
    expect(adapter.credentialFields?.map((f) => f.key)).toEqual(['project', 'location', 'googleCredentials']);
  });

  it('generates Imagen images as data URIs', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse({ predictions: [{ bytesBase64Encoded: 'QUJD', mimeType: 'image/png' }] }),
    );
    const result = await adapter.generateImage('a cat', vertexCreds);
    expect(mockSafeFetch.mock.calls[0][0]).toContain('imagen-3.0-generate-002:predict');
    expect(result.image).toBe('data:image/png;base64,QUJD');
  });

  it('submits Veo long-running operations and polls via fetchPredictOperation', async () => {
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({ name: 'projects/p/locations/r/publishers/google/models/veo-2.0-generate-001/operations/op-1' }),
    );
    const submission = await adapter.generateVideo('a sunset', vertexCreds);
    expect(submission.jobId).toContain('operations/op-1');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ done: false }));
    expect((await adapter.pollJob(submission.jobId, vertexCreds)).status).toBe('pending');

    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({ done: true, response: { videos: [{ gcsUri: 'https://storage.googleapis.com/out.mp4', mimeType: 'video/mp4' }] } }),
    );
    expect(await adapter.pollJob(submission.jobId, vertexCreds)).toMatchObject({
      status: 'completed',
      artifactUrl: 'https://storage.googleapis.com/out.mp4',
    });

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ done: true, error: { message: 'blocked' } }));
    expect(await adapter.pollJob(submission.jobId, vertexCreds)).toMatchObject({ status: 'failed', error: 'blocked' });
  });
});

describe('BlackForestLabsAdapter', () => {
  const adapter = new BlackForestLabsAdapter();

  it('submits and internally polls until Ready (sync image contract)', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'bfl-1' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'Pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'Ready', result: { sample: 'https://bfl/out.png', seed: 1 } }));
    const result = await adapter.generateImage('a cat', { ...CREDS, size: '512x512' });
    expect(result.image).toBe('https://bfl/out.png');
    expect(result.metadata).toMatchObject({ seed: 1, width: 512, height: 512 });
  }, 15000);

  it('throws on moderation/error states', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'bfl-2' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'Error', details: 'nope' }));
    await expect(adapter.generateImage('a cat', CREDS)).rejects.toThrow('nope');
  });
});

describe('OpenaiMediaAdapter', () => {
  const adapter = new OpenaiMediaAdapter();

  it('generates images and returns the standardized shape', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ data: [{ url: 'https://oai/1.png' }] }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(result).toMatchObject({ multi: false, image: 'https://oai/1.png' });
  });

  it('returns inline TTS audio submissions', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({}));
    const result = await adapter.generateAudio('say hi', CREDS);
    expect(result.artifactUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it('transcribes audio', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ text: 'hello' }));
    expect(await adapter.speechToText(Buffer.from('a'), CREDS)).toBe('hello');
  });
});

describe('ReplicateMediaAdapter', () => {
  const adapter = new ReplicateMediaAdapter();

  it('passes the webhook to predictions', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ id: 'pred-1' }));
    await adapter.generateVideo('a sunset', { ...CREDS, webhookUrl: 'https://cb' });
    const body = JSON.parse((mockSafeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.webhook).toBe('https://cb');
  });

  it('polls predictions', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'succeeded', output: ['https://rep/out.mp4'] }));
    expect(await adapter.pollJob('pred-1', CREDS)).toMatchObject({ status: 'completed', artifactUrl: 'https://rep/out.mp4' });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'processing' }));
    expect((await adapter.pollJob('pred-1', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ status: 'failed', error: 'oom' }));
    expect(await adapter.pollJob('pred-1', CREDS)).toMatchObject({ status: 'failed', error: 'oom' });
  });

  it('runOfficial posts to /models/{id}/predictions with no version', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ id: 'pred-official', status: 'succeeded', output: ['https://rep/out.png'] }));
    const result = await adapter.runOfficial('black-forest-labs/flux-schnell', { prompt: 'cat' }, { ...CREDS, wait: true, webhookUrl: 'https://cb' });

    const url = mockSafeFetch.mock.calls[0][0];
    expect(url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions');

    const init = mockSafeFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('version');
    expect(body.input).toMatchObject({ prompt: 'cat' });
    expect(body.webhook).toBe('https://cb');
    expect((init.headers as Record<string, string>)['Prefer']).toBe('wait=60');
    expect(result).toMatchObject({ id: 'pred-official', status: 'succeeded' });
  });

  it('runCommunity posts to /predictions with the supplied version', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ id: 'pred-community', status: 'starting' }));
    const result = await adapter.runCommunity('v-community', { prompt: 'cat' }, { ...CREDS, webhookUrl: 'https://cb' });

    const url = mockSafeFetch.mock.calls[0][0];
    expect(url).toBe('https://api.replicate.com/v1/predictions');

    const init = mockSafeFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.version).toBe('v-community');
    expect(body.input).toMatchObject({ prompt: 'cat' });
    expect(body.webhook).toBe('https://cb');
    expect(result).toMatchObject({ id: 'pred-community', status: 'starting' });
  });
});

describe('LumaAdapter', () => {
  const adapter = new LumaAdapter();

  it('submits generations with callback_url and polls state', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ id: 'luma-1' }));
    const submission = await adapter.generateVideo('a sunset', { ...CREDS, webhookUrl: 'https://cb' });
    const body = JSON.parse((mockSafeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.callback_url).toBe('https://cb');
    expect(submission.jobId).toBe('luma-1');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ state: 'completed', assets: { video: 'https://luma/out.mp4' } }));
    expect(await adapter.pollJob('luma-1', CREDS)).toMatchObject({ status: 'completed', artifactUrl: 'https://luma/out.mp4' });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ state: 'dreaming' }));
    expect((await adapter.pollJob('luma-1', CREDS)).status).toBe('pending');
  });
});

describe('HeyGenAdapter', () => {
  const adapter = new HeyGenAdapter();

  it('submits avatar videos and polls status', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ data: { video_id: 'hg-1' } }));
    const submission = await adapter.generateAvatar('hello', { ...CREDS, avatarId: 'av-1' });
    expect(submission.jobId).toBe('hg-1');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'completed', video_url: 'https://hg/out.mp4', duration: 12 } }));
    const poll = await adapter.pollJob('hg-1', CREDS);
    expect(poll).toMatchObject({ status: 'completed', artifactUrl: 'https://hg/out.mp4' });
    expect(poll.metadata?.durationSeconds).toBe(12);
  });
});

describe('ElevenLabsAdapter / DeepgramAdapter', () => {
  it('elevenlabs returns inline audio submissions', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({}));
    const adapter = new ElevenLabsAdapter();
    const result = await adapter.generateAudio('say hi', CREDS);
    expect(result.artifactUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it('deepgram transcribes', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hi there' }] }] } }),
    );
    const adapter = new DeepgramAdapter();
    expect(await adapter.speechToText(Buffer.from('a'), CREDS)).toBe('hi there');
  });

  it('deepgram throws without a transcript', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ results: { channels: [] } }));
    const adapter = new DeepgramAdapter();
    await expect(adapter.speechToText(Buffer.from('a'), CREDS)).rejects.toThrow('no transcript');
  });

  it('deepgram words returns timings and passes smart_format + language opts', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse({
        results: { channels: [{ alternatives: [{ transcript: 'hi there', words: [{ word: 'hi', start: 0, end: 0.5 }] }] }] },
      }),
    );
    const adapter = new DeepgramAdapter();
    const result = await adapter.speechToTextWords(Buffer.from('a'), {
      ...CREDS,
      model: 'nova-2',
      input: { smartFormat: true, language: 'es' },
    });
    expect(result.words).toHaveLength(1);
    const url = mockSafeFetch.mock.calls.at(-1)![0] as string;
    expect(url).toContain('model=nova-2');
    expect(url).toContain('smart_format=true');
    expect(url).toContain('punctuate=true');
    expect(url).toContain('language=es');
  });

  it('deepgram words omits opts the caller did not set', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hi', words: [] }] }] } }),
    );
    const adapter = new DeepgramAdapter();
    await adapter.speechToTextWords(Buffer.from('a'), CREDS);
    const url = mockSafeFetch.mock.calls.at(-1)![0] as string;
    expect(url).not.toContain('smart_format');
    expect(url).not.toContain('language=');
  });
});

describe('QwenMediaAdapter', () => {
  const adapter = new QwenMediaAdapter();

  it('submits Qwen-Image text-to-image as a DashScope async task and routes params', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'task-img', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(jsonResponse({ output: { task_status: 'RUNNING' } }))
      .mockResolvedValueOnce(
        jsonResponse({ output: { task_status: 'SUCCEEDED', results: [{ url: 'https://dashscope/out.png' }] } }),
      );
    const result = await adapter.generateImage('a cat', {
      ...CREDS,
      input: { negative_prompt: 'blurry', size: '1328*1328', watermark: false },
    });
    const url = mockSafeFetch.mock.calls[0][0] as string;
    expect(url).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis');
    const init = mockSafeFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
    // negative_prompt → input, size/watermark → parameters.
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'qwen-image-plus',
      input: { prompt: 'a cat', negative_prompt: 'blurry' },
      parameters: { size: '1328*1328', watermark: false },
    });
    expect(result.image).toBe('https://dashscope/out.png');
  }, 15000);

  it('submits Wan2.x video tasks (no webhook) and returns the task id', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ output: { task_id: 'task-vid', task_status: 'PENDING' } }));
    const submission = await adapter.generateVideo('a sunset', { ...CREDS, model: 'wan2.2-t2v-plus' });
    expect(mockSafeFetch.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    );
    expect(submission.jobId).toBe('task-vid');
  });

  it('routes img_url into input for image-to-video', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ output: { task_id: 'task-i2v' } }));
    await adapter.generateVideo('pan', {
      ...CREDS,
      model: 'wan2.2-i2v-plus',
      input: { img_url: 'https://img/src.png', resolution: '720P' },
    });
    const body = JSON.parse((mockSafeFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.input).toMatchObject({ prompt: 'pan', img_url: 'https://img/src.png' });
    expect(body.parameters).toMatchObject({ resolution: '720P' });
  });

  it('polls task status (image url, video url, pending, failed)', async () => {
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({ output: { task_status: 'SUCCEEDED', video_url: 'https://dashscope/out.mp4' } }),
    );
    expect(await adapter.pollJob('task-vid', CREDS)).toMatchObject({
      status: 'completed',
      artifactUrl: 'https://dashscope/out.mp4',
    });
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ output: { task_status: 'RUNNING' } }));
    expect((await adapter.pollJob('task-vid', CREDS)).status).toBe('pending');
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({ output: { task_status: 'FAILED', message: 'content moderated' } }),
    );
    expect(await adapter.pollJob('task-vid', CREDS)).toMatchObject({ status: 'failed', error: 'content moderated' });
  });

  it('rejects unsupported operations and requires a key', async () => {
    await expect(adapter.generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(adapter.generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(adapter.generateVideo('x', {})).rejects.toThrow('API key');
  });

  it('tests the connection via the OpenAI-compatible models list', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ data: [] }));
    const ok = await adapter.testConnection(CREDS);
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models');
    expect(ok).toMatchObject({ ok: true });
    expect(await adapter.testConnection({})).toMatchObject({ ok: false });
  });
});

// ── Additional branch coverage ──

describe('ReplicateMediaAdapter image + edits', () => {
  const adapter = new ReplicateMediaAdapter();

  it('generates images with Prefer: wait and normalizes array output', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ output: ['https://rep/1.png', 'https://rep/2.png'] }));
    const result = await adapter.generateImage('two cats', CREDS);
    const init = mockSafeFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Prefer']).toBe('wait=60');
    expect(result).toMatchObject({ multi: true, image: 'https://rep/1.png' });
  });

  it('normalizes string output', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ output: 'https://rep/one.png' }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(result).toMatchObject({ multi: false, image: 'https://rep/one.png' });
  });

  it('throws on missing output', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({}));
    await expect(adapter.generateImage('a cat', CREDS)).rejects.toThrow('no output');
  });

  it('upscales, removes backgrounds, and inpaints via predictions', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ output: 'https://rep/edited.png' }));
    expect(await adapter.upscaleImage('https://x/low.png', CREDS)).toBe('https://rep/edited.png');
    expect(await adapter.removeBackground('https://x/img.png', CREDS)).toBe('https://rep/edited.png');
    expect(await adapter.inpaintImage('https://x/img.png', 'https://x/mask.png', 'fill', CREDS)).toBe(
      'https://rep/edited.png',
    );
  });

  it('propagates provider errors', async () => {
    mockSafeFetch.mockResolvedValue({ ...jsonResponse({}), ok: false, text: async () => 'rate limited' });
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('rate limited');
  });
});

describe('RunwayAdapter image (bounded internal poll)', () => {
  const adapter = new RunwayAdapter();

  it('polls the task until SUCCEEDED and returns the image', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-img' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'RUNNING' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'SUCCEEDED', output: ['https://r/img.png'] }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(result.image).toBe('https://r/img.png');
  }, 15000);

  it('throws when the image task fails', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-img' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'FAILED', failure: 'moderated' }));
    await expect(adapter.generateImage('a cat', CREDS)).rejects.toThrow('moderated');
  }, 15000);
});

describe('StabilityAdapter video submission', () => {
  const adapter = new StabilityAdapter();

  it('requires a source image', async () => {
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('source image');
  });

  it('downloads the source frame and submits image-to-video', async () => {
    mockSafeFetch
      .mockResolvedValueOnce({ ...jsonResponse({}), arrayBuffer: async () => new Uint8Array([9]).buffer })
      .mockResolvedValueOnce(jsonResponse({ id: 'vid-9' }));
    const result = await adapter.generateVideo('animate', { ...CREDS, sourceUrl: 'https://img/frame.png' });
    expect(result.jobId).toBe('vid-9');
    expect(mockSafeFetch.mock.calls[1][0]).toBe('https://api.stability.ai/v2beta/image-to-video');
  });
});

describe('LumaAdapter / HeyGenAdapter error paths', () => {
  it('luma rejects unsupported operations and missing ids', async () => {
    const adapter = new LumaAdapter();
    await expect(adapter.generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(adapter.generateAudio('x', CREDS)).rejects.toThrow('audio');
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({}));
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('no generation id');
  });

  it('luma reports failed generations', async () => {
    const adapter = new LumaAdapter();
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ state: 'failed', failure_reason: 'nsfw' }));
    expect(await adapter.pollJob('luma-1', CREDS)).toMatchObject({ status: 'failed', error: 'nsfw' });
  });

  it('heygen reports failed videos and missing urls', async () => {
    const adapter = new HeyGenAdapter();
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'failed', error: { message: 'no avatar' } } }));
    expect(await adapter.pollJob('hg-1', CREDS)).toMatchObject({ status: 'failed', error: 'no avatar' });

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'completed' } }));
    expect((await adapter.pollJob('hg-1', CREDS)).status).toBe('failed');

    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'processing' } }));
    expect((await adapter.pollJob('hg-1', CREDS)).status).toBe('pending');
  });
});

describe('OpenaiMediaAdapter speech + errors', () => {
  const adapter = new OpenaiMediaAdapter();

  it('textToSpeech returns a Buffer of the audio bytes', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({}));
    const audio = await adapter.textToSpeech('hi', CREDS);
    expect(Buffer.isBuffer(audio)).toBe(true);
  });

  it('rejects unsupported operations', async () => {
    await expect(adapter.generateVideo('x', CREDS)).rejects.toThrow('video');
    await expect(adapter.generateAvatar('x', CREDS)).rejects.toThrow('avatar');
  });

  it('throws on API errors', async () => {
    mockSafeFetch.mockResolvedValue({ ...jsonResponse({}), ok: false, text: async () => 'invalid key' });
    await expect(adapter.generateImage('a cat', CREDS)).rejects.toThrow('invalid key');
    await expect(adapter.speechToText(Buffer.from('a'), CREDS)).rejects.toThrow('invalid key');
  });

  it('decodes b64_json images into data URIs', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ data: [{ b64_json: 'QUJD' }] }));
    const result = await adapter.generateImage('a cat', CREDS);
    expect(result.image).toBe('data:image/png;base64,QUJD');
  });
});

describe('Capability stubs reject unsupported operations', () => {
  it('every adapter throws a descriptive error for unsupported media types', async () => {
    await expect(new FalAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new RunwayAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new StabilityAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new TavusAdapter().generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(new TavusAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new DIDAdapter().generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(new DIDAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new HedraAdapter().generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(new HedraAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new MiniMaxMediaAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new VertexMediaAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new BlackForestLabsAdapter().generateVideo('x', CREDS)).rejects.toThrow('video');
    await expect(new BlackForestLabsAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new BlackForestLabsAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new ElevenLabsAdapter().generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(new ElevenLabsAdapter().generateVideo('x', CREDS)).rejects.toThrow('video');
    await expect(new ElevenLabsAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
    await expect(new DeepgramAdapter().generateImage('x', CREDS)).rejects.toThrow('image');
    await expect(new DeepgramAdapter().generateVideo('x', CREDS)).rejects.toThrow('video');
    await expect(new DeepgramAdapter().generateAudio('x', CREDS)).rejects.toThrow('audio');
    await expect(new DeepgramAdapter().generateAvatar('x', CREDS)).rejects.toThrow('avatar');
  });

  it('poll failures surface as failed results', async () => {
    mockSafeFetch.mockResolvedValue({ ...jsonResponse({}), ok: false, text: async () => 'unauthorized' });
    expect(await new RunwayAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new TavusAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new DIDAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new HedraAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new MiniMaxMediaAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new LumaAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new HeyGenAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
    expect(await new ReplicateMediaAdapter().pollJob('t', CREDS)).toMatchObject({ status: 'failed' });
  });
});
