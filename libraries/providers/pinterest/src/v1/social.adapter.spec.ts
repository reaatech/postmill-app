import { describe, it, expect, vi, beforeEach } from 'vitest';

// Partially mock the kernel so `safeFetch` is a spy while SocialAbstract / the
// BadBody Proxy / setSocialFetchPorts (all needed to construct + throw) stay real.
vi.mock('@gitroom/provider-kernel', async (orig) => {
  const actual: any = await orig();
  return { ...actual, safeFetch: vi.fn() };
});

import { safeFetch, setSocialFetchPorts } from '@gitroom/provider-kernel';
import { PinterestProvider } from './social.adapter';

// The `BadBody` kernel Proxy constructs `new _ports.BadBodyError(...args)`, where
// args = (provider, body, raw, reason). Capture `reason` as the Error message so
// the test can assert the guard fired with the right status.
class TestBadBody extends Error {
  constructor(
    public provider: string,
    public body: string,
    public raw: unknown,
    public reason: string,
  ) {
    super(reason);
  }
}

const UPLOAD_URL = 'https://s3.example.com/presigned';
const postDetails = [
  { id: 'p1', message: 'hi', media: [{ path: 'https://cdn.example.com/video.mp4' }] },
] as any;

describe('PinterestProvider.post — presigned upload failure (0.1)', () => {
  let provider: PinterestProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    setSocialFetchPorts({
      getVpnDispatcher: () => undefined,
      ssrfSafeDispatcher: undefined,
      isSafePublicHttpsUrl: async () => true,
      undiciFetch: (async () => new Response()) as any,
      RefreshTokenError: class extends Error {},
      BadBodyError: TestBadBody,
      timer: (async () => undefined) as any,
      sharp: (() => ({ metadata: async () => ({ width: 100, height: 100 }) })) as any,
      readOrFetch: (async () => Buffer.from('x')) as any,
      safeFetch: (async () => new Response()) as any,
    } as any);

    provider = new PinterestProvider();
    // this.fetch → the media-creation call returns the presigned target.
    vi.spyOn(provider as any, 'fetch').mockResolvedValue({
      json: async () => ({
        upload_url: UPLOAD_URL,
        media_id: 'media-1',
        upload_parameters: { key: 'k' },
      }),
    });
  });

  it('throws BadBody on a non-2xx presigned upload instead of entering the poll loop', async () => {
    (safeFetch as any).mockImplementation(async (url: string) => {
      if (url === UPLOAD_URL) {
        // S3 rejects the (expired/oversized) presigned policy. safeFetch returns
        // non-2xx WITHOUT throwing — the guard must catch it and fail fast.
        return { ok: false, status: 403 };
      }
      // the source-media download leg (no stream body → readBoundedBlob falls back)
      return {
        ok: true,
        status: 200,
        body: null,
        headers: { get: () => 'video/mp4' },
        blob: async () => new Blob([new Uint8Array([1, 2, 3])]),
      };
    });

    const err = await provider.post('id', 'token', postDetails).then(
      () => null,
      (e) => e,
    );

    expect(err).toBeInstanceOf(TestBadBody);
    expect((err as TestBadBody).reason).toBe('Media upload failed (status 403)');

    // The media-creation call fired once; the poll loop (a SECOND this.fetch to
    // /v5/media/<id>) was never reached because we failed fast.
    expect((provider as any).fetch).toHaveBeenCalledTimes(1);
  });

  // 2.4: the streaming cap must abort mid-stream — a chunked body crossing the
  // limit is cancelled, not buffered to completion and measured afterwards.
  it('readBoundedBlob aborts a chunked body that crosses the byte cap', async () => {
    const chunks = [new Uint8Array(8), new Uint8Array(8)];
    let reads = 0;
    const cancel = vi.fn().mockResolvedValue(undefined);
    const response = {
      body: {
        getReader: () => ({
          read: async () =>
            reads < chunks.length
              ? { done: false, value: chunks[reads++] }
              : { done: true, value: undefined },
          cancel,
          releaseLock: vi.fn(),
        }),
      },
      headers: { get: () => 'video/mp4' },
    } as unknown as Response;

    const err = await (provider as any)
      .readBoundedBlob(response, 10)
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(TestBadBody);
    expect((err as TestBadBody).reason).toMatch(/exceeds the .*upload cap/);
    // Aborted at the crossing chunk — the stream was cancelled, not drained.
    expect(cancel).toHaveBeenCalled();
    expect(reads).toBe(2);
  });

  it('readBoundedBlob passes a body under the cap through intact', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    let read = false;
    const response = {
      body: {
        getReader: () => ({
          read: async () =>
            read
              ? { done: true, value: undefined }
              : ((read = true), { done: false, value: payload }),
          cancel: vi.fn(),
          releaseLock: vi.fn(),
        }),
      },
      headers: { get: () => 'video/mp4' },
    } as unknown as Response;

    const blob: Blob = await (provider as any).readBoundedBlob(response, 10);
    expect(blob.size).toBe(4);
    expect(blob.type).toBe('video/mp4');
  });
});
