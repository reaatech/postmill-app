import { describe, it, expect, vi } from 'vitest';
import { MeweProvider } from './social.adapter';

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
