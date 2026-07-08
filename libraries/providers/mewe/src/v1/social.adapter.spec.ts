import { describe, it, expect, vi } from 'vitest';
import { MeweProvider } from './social.adapter';

vi.mock('@gitroom/provider-kernel', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    safeFetch: vi.fn().mockResolvedValue({
      blob: async () => new Blob(['pixels']),
    }),
  };
});

const mockResponse = (body: {
  groups: Array<{ groupId: string; name: string }>;
  nextPage: string | null;
}) =>
  ({
    json: async () => body,
  } as any);

describe('MeweProvider.groups (FETCH-06)', () => {
  const makeIntegration = () =>
    ({ organizationId: 'org-test', id: 'int-test' } as any);

  it('routes group listing calls through this.fetch()', async () => {
    const provider = new MeweProvider();
    const fetchSpy = vi
      .spyOn(provider as any, 'fetch')
      .mockResolvedValue(
        mockResponse({
          groups: [{ groupId: 'g1', name: 'Group 1' }],
          nextPage: null,
        })
      );

    const result = await provider.groups(
      'access-token',
      {},
      'provider-id',
      makeIntegration()
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mewe.com/api/dev/groups',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
      'mewe-groups'
    );
    expect(result).toEqual([{ id: 'g1', name: 'Group 1' }]);
  });

  it('follows pagination and stops when there is no next page', async () => {
    const provider = new MeweProvider();
    let calls = 0;
    const fetchSpy = vi
      .spyOn(provider as any, 'fetch')
      .mockImplementation(() => {
        calls += 1;
        return Promise.resolve(
          mockResponse({
            groups: [{ groupId: `g${calls}`, name: `Group ${calls}` }],
            nextPage:
              calls < 3 ? `/api/dev/groups?page=${calls + 1}` : null,
          })
        );
      });

    const result = await provider.groups(
      'access-token',
      {},
      'provider-id',
      makeIntegration()
    );

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ id: 'g3', name: 'Group 3' });
  });

  it('caps pagination at 100 pages and returns collected groups', async () => {
    const provider = new MeweProvider();
    let calls = 0;
    const fetchSpy = vi
      .spyOn(provider as any, 'fetch')
      .mockImplementation(() => {
        calls += 1;
        return Promise.resolve(
          mockResponse({
            groups: [{ groupId: `g${calls}`, name: `Group ${calls}` }],
            nextPage: '/api/dev/groups?page=next',
          })
        );
      });

    const result = await provider.groups(
      'access-token',
      {},
      'provider-id',
      makeIntegration()
    );

    expect(fetchSpy).toHaveBeenCalledTimes(100);
    expect(result).toHaveLength(100);
  });

  it('returns an empty array when this.fetch() throws', async () => {
    const provider = new MeweProvider();
    vi.spyOn(provider as any, 'fetch').mockRejectedValue(new Error('network'));

    const result = await provider.groups(
      'access-token',
      {},
      'provider-id',
      makeIntegration()
    );

    expect(result).toEqual([]);
  });
});

describe('MeweProvider authenticate / post / upload SSRF guard (B-02)', () => {
  const makeClientInfo = (overrides: Record<string, string> = {}) => ({
    client_id: 'app-id',
    client_secret: 'api-key',
    instanceUrl: 'https://mewe.com',
    ...overrides,
  });

  it('rejects an HTTP instanceUrl during authentication', async () => {
    const provider = new MeweProvider();
    const result = await provider.authenticate(
      { code: 'code', codeVerifier: 'verifier' },
      makeClientInfo({ instanceUrl: 'http://internal.local' })
    );

    expect(result).toBe('Invalid MeWe instance URL: only HTTPS is allowed.');
  });

  it('routes authentication calls through this.fetch()', async () => {
    const provider = new MeweProvider();
    const fetchSpy = vi.spyOn(provider as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        apiToken: 'token',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    } as any);

    await provider.authenticate(
      { code: 'code', codeVerifier: 'verifier' },
      makeClientInfo()
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mewe.com/api/dev/token?loginRequestToken=code',
      expect.objectContaining({ method: 'GET' }),
      'mewe-token'
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mewe.com/api/dev/me',
      expect.objectContaining({ method: 'GET' }),
      'mewe-profile'
    );
  });

  it('routes post and photo-upload calls through this.fetch()', async () => {
    const provider = new MeweProvider();
    const fetchSpy = vi.spyOn(provider as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'photo-1' }),
    } as any);

    await provider.post(
      'id',
      'access-token',
      [
        {
          message: 'hello',
          settings: { postType: 'timeline' },
          media: [{ path: 'https://example.com/photo.jpg' }],
        } as any,
      ],
      { organizationId: 'org-1', id: 'int-1' } as any,
      makeClientInfo()
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mewe.com/api/dev/photo/upload',
      expect.objectContaining({ method: 'POST' }),
      'mewe-photo-upload'
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mewe.com/api/dev/me/post',
      expect.objectContaining({ method: 'POST' }),
      'mewe-post'
    );
  });
});
