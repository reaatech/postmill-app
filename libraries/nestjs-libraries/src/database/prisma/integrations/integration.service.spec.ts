import { describe, it, expect, vi } from 'vitest';
import { IntegrationService } from './integration.service';

describe('IntegrationService.getHealthSummary', () => {
  it('returns only unhealthy integrations and omits token fields', async () => {
    const repository = {
      getIntegrationsHealth: vi.fn().mockResolvedValue([
        { id: 'i1', name: 'X', providerIdentifier: 'x', picture: 'x.png', refreshNeeded: false, disabled: false, tokenExpiration: null },
        { id: 'i2', name: 'LinkedIn', providerIdentifier: 'linkedin', picture: 'li.png', refreshNeeded: true, disabled: false, tokenExpiration: null },
        { id: 'i3', name: 'Bluesky', providerIdentifier: 'bluesky', picture: 'bs.png', refreshNeeded: false, disabled: true, tokenExpiration: null },
      ]),
    } as any;

    const service = new IntegrationService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getHealthSummary('org-1');

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['i2', 'i3']);
    for (const item of result) {
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('refreshToken');
    }
  });

  it('returns empty array when all channels are healthy', async () => {
    const repository = {
      getIntegrationsHealth: vi.fn().mockResolvedValue([
        { id: 'i1', refreshNeeded: false, disabled: false },
      ]),
    } as any;

    const service = new IntegrationService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    expect(await service.getHealthSummary('org-1')).toEqual([]);
  });
});
