import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgProviderConfigService } from './org-provider-config.service';

// F2(c): a channel credential create/rotate must emit a non-fatal `credential.rotated`
// audit event whose metadata carries ONLY the provider + config id — never the secret.
describe('OrgProviderConfigService audit (F2c)', () => {
  let record: ReturnType<typeof vi.fn>;
  let repository: any;
  let service: OrgProviderConfigService;

  beforeEach(() => {
    record = vi.fn().mockResolvedValue(undefined);
    repository = {
      create: vi.fn(),
      getById: vi.fn(),
      updateById: vi.fn(),
    };
    const encryption = { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v } as any;
    const vpn = { listEnabledRegions: vi.fn().mockResolvedValue([]) } as any;
    const resolution = { latestActiveVersion: vi.fn().mockReturnValue('v1') } as any;
    service = new OrgProviderConfigService(
      repository,
      encryption,
      vpn,
      resolution,
      { record } as any
    );
  });

  const baseRow = (over: Record<string, unknown> = {}) => ({
    id: 'cfg1',
    organizationId: 'o1',
    identifier: 'twitter',
    name: 'My Twitter App',
    version: 'v1',
    enabled: true,
    clientId: 'enc:cid',
    clientSecret: 'enc:csecret',
    additionalConfig: null,
    redirectUri: null,
    scopes: null,
    setupNotes: null,
    vpnSelection: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  it('records credential.rotated on create with no secret in metadata', async () => {
    repository.create.mockResolvedValue(baseRow());

    await service.createConfig(
      'o1',
      {
        identifier: 'twitter',
        name: 'My Twitter App',
        enabled: true,
        clientId: 'super-secret-id',
        clientSecret: 'super-secret-value',
      },
      'u1'
    );

    expect(record).toHaveBeenCalledTimes(1);
    const arg = record.mock.calls[0][0];
    expect(arg.action).toBe('credential.rotated');
    expect(arg.orgId).toBe('o1');
    expect(arg.userId).toBe('u1');
    expect(arg.metadata).toEqual({ provider: 'twitter', configId: 'cfg1' });
    // The secret values must never appear anywhere in the audit payload.
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain('super-secret-id');
    expect(serialized).not.toContain('super-secret-value');
    expect(serialized).not.toMatch(/secret|password/i);
  });

  it('records credential.rotated on update with only provider + config id', async () => {
    repository.getById.mockResolvedValue(baseRow());
    repository.updateById.mockResolvedValue(baseRow());

    await service.updateConfig(
      'o1',
      'cfg1',
      { clientSecret: 'rotated-secret' },
      'u1'
    );

    expect(record).toHaveBeenCalledTimes(1);
    const arg = record.mock.calls[0][0];
    expect(arg.action).toBe('credential.rotated');
    expect(arg.metadata).toEqual({ provider: 'twitter', configId: 'cfg1' });
    expect(JSON.stringify(arg)).not.toContain('rotated-secret');
  });

  it('is non-fatal when the audit write rejects', async () => {
    record.mockRejectedValue(new Error('audit down'));
    repository.create.mockResolvedValue(baseRow());

    await expect(
      service.createConfig(
        'o1',
        { identifier: 'twitter', name: 'App', enabled: false },
        'u1'
      )
    ).resolves.toBeDefined();
  });
});
