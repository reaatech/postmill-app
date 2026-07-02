import { describe, it, expect } from 'vitest';
import { makeCtx, res } from '@gitroom/provider-kernel/testing/media-int-helpers';
import { vertexMediaModule } from './media.adapter';

// Recorded-fixture integration test (plan B4) — no network. Vertex uses GCP credentials, not a
// single apiKey: the durable credential is the service-account JSON, from which a short-lived
// access token is minted via google-auth-library (a real network/GCP call we cannot drive
// offline). The adapter, by design, also accepts a raw `credentials.accessToken` for advanced
// callers — these tests pass that token so the full request/poll paths are exercised honestly
// without a live GCP token mint. The googleCredentials minting path is therefore NOT covered
// here (it requires real GCP auth); missing-credential validation is asserted instead.

const CREDS = { project: 'my-proj', location: 'us-central1', accessToken: 'tok-1' };

describe('vertex media adapter (Imagen image + Veo long-running video)', () => {
  it('generateImage POSTs to the Imagen :predict endpoint with Bearer auth and returns an inline data URL', async () => {
    const { recs, ctx } = makeCtx(() =>
      res({ predictions: [{ bytesBase64Encoded: 'SU1H', mimeType: 'image/png' }] }),
    );
    const adapter: any = vertexMediaModule.create(ctx as any);

    const out = await adapter.generateImage('a red fox', {
      credentials: CREDS,
      model: 'imagen-3.0-generate-002',
      input: { aspectRatio: '1:1', sampleCount: 1 },
    });

    const r = recs[0];
    expect(r.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict',
    );
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer tok-1');
    const body = JSON.parse(r.body);
    expect(body.instances).toEqual([{ prompt: 'a red fox' }]);
    expect(body.parameters.aspectRatio).toBe('1:1');
    expect(out.image).toBe('data:image/png;base64,SU1H');
  });

  it('generateVideo submits to :predictLongRunning and returns the operation name as the jobId', async () => {
    const opName =
      'projects/my-proj/locations/us-central1/publishers/google/models/veo-2.0-generate-001/operations/op-1';
    const { recs, ctx } = makeCtx(() => res({ name: opName }));
    const adapter: any = vertexMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('a cat surfing', {
      credentials: CREDS,
      model: 'veo-2.0-generate-001',
      input: { durationSeconds: 5 },
    });

    expect(sub.jobId).toBe(opName);
    const r = recs[0];
    expect(r.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/veo-2.0-generate-001:predictLongRunning',
    );
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer tok-1');
    const body = JSON.parse(r.body);
    expect(body.instances).toEqual([{ prompt: 'a cat surfing' }]);
    expect(body.parameters.durationSeconds).toBe(5);
  });

  it('pollJob POSTs to :fetchPredictOperation and parses done:false → pending and done:true → completed', async () => {
    const opName =
      'projects/my-proj/locations/us-central1/publishers/google/models/veo-2.0-generate-001/operations/op-1';

    const pendingCtx = makeCtx(() => res({ name: opName, done: false }));
    const pendingAdapter: any = vertexMediaModule.create(pendingCtx.ctx as any);
    const pending = await pendingAdapter.pollJob(opName, { credentials: CREDS });
    expect(pending.status).toBe('pending');
    expect(pendingCtx.recs[0].url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/veo-2.0-generate-001:fetchPredictOperation',
    );
    expect(JSON.parse(pendingCtx.recs[0].body)).toEqual({ operationName: opName });

    const doneCtx = makeCtx(() =>
      res({
        name: opName,
        done: true,
        response: { videos: [{ bytesBase64Encoded: 'VklE', mimeType: 'video/mp4' }] },
      }),
    );
    const doneAdapter: any = vertexMediaModule.create(doneCtx.ctx as any);
    const done = await doneAdapter.pollJob(opName, { credentials: CREDS });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe('data:video/mp4;base64,VklE');
  });

  it('rejects missing GCP credentials and unsupported operations', async () => {
    const { ctx } = makeCtx(() => res({}));
    const adapter: any = vertexMediaModule.create(ctx as any);
    // No project → fails before any token mint.
    await expect(adapter.generateImage('x', { credentials: { location: 'us-central1' } })).rejects.toThrow(
      'requires a GCP project ID',
    );
    // Project present but no access token and no service-account JSON.
    await expect(
      adapter.generateImage('x', { credentials: { project: 'p' } }),
    ).rejects.toThrow('requires a service account JSON');
    await expect(adapter.generateAudio('x', { credentials: CREDS })).rejects.toThrow();
    await expect(adapter.generateAvatar('x', { credentials: CREDS })).rejects.toThrow();
  });
});
