import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgShortLinkSettingsService } from './org-shortlink-settings.service';
import { OrgShortLinkSettingsRepository } from './org-shortlink-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { ShortLinkRegistry } from '@gitroom/nestjs-libraries/short-linking/short-link.registry';
import type { ShortLinkAdapter, ShortLinkCapabilities, ShortLinkCredentialField } from '@gitroom/nestjs-libraries/short-linking/short-link.interface';

const mockCapabilities: ShortLinkCapabilities = {
  create: true,
  expand: true,
  statistics: true,
  bulkStatistics: true,
  customDomain: false,
};

const credFields: ShortLinkCredentialField[] = [
  { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
  { key: 'groupGuid', label: 'Group GUID', type: 'string', required: false, placeholder: 'Optional' },
];

const createMockAdapter = (id: string, opts?: {
  name?: string;
  caps?: Partial<ShortLinkCapabilities>;
  fields?: ShortLinkCredentialField[];
  authType?: 'none' | 'apiKey' | 'oauth2';
  defaultDomain?: string;
  setupNotes?: string;
}): ShortLinkAdapter => ({
  identifier: id,
  name: opts?.name ?? `Adapter ${id}`,
  credentialFields: opts?.fields ?? credFields,
  capabilities: { ...mockCapabilities, ...opts?.caps },
  authType: opts?.authType ?? 'apiKey',
  defaultDomain: opts?.defaultDomain,
  setupNotes: opts?.setupNotes,
  resolveDomain: () => opts?.defaultDomain ?? id,
  validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
  createShortLink: async () => ({ shortUrl: `https://${id}/abc` }),
});

function dbConfig(identifier: string, overrides?: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    identifier,
    credentials: overrides?.credentials as string | null ?? null,
    customDomain: overrides?.customDomain as string | undefined ?? undefined,
    extraConfig: overrides?.extraConfig as string | undefined ?? undefined,
    enabled: (overrides?.enabled as boolean) ?? false,
    isActive: (overrides?.isActive as boolean) ?? false,
    createdAt: overrides?.createdAt as Date | undefined ?? new Date(),
    updatedAt: overrides?.updatedAt as Date | undefined ?? new Date(),
  };
}

describe('OrgShortLinkSettingsService', () => {
  let service: OrgShortLinkSettingsService;
  let repository: OrgShortLinkSettingsRepository;
  let encryption: EncryptionService;
  let registry: ShortLinkRegistry;

  const orgId = 'org-1';

  beforeEach(() => {
    repository = {
      getByOrg: vi.fn().mockResolvedValue([]),
      getByIdentifier: vi.fn().mockResolvedValue(null),
      getActive: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      setActive: vi.fn().mockResolvedValue({}),
      recordLink: vi.fn(),
      findLinkByShortUrl: vi.fn(),
      getLinksForOrg: vi.fn(),
      upsertSnapshotFull: vi.fn(),
      getSnapshotsForLinks: vi.fn(),
      pruneSnapshots: vi.fn(),
      getAggregatedClicks: vi.fn(),
    } as any;

    encryption = {
      encrypt: vi.fn((val: string) => `encrypted:${val}`),
      decrypt: vi.fn((val: string) => {
        if (typeof val !== 'string' || !val.startsWith('encrypted:')) {
          throw new Error('Not encrypted');
        }
        return val.slice('encrypted:'.length);
      }),
      encryptDeterministic: vi.fn(),
    } as any;

    registry = new ShortLinkRegistry();

    service = new OrgShortLinkSettingsService(
      repository as OrgShortLinkSettingsRepository,
      encryption as EncryptionService,
      registry,
    );
  });

  describe('getProviders', () => {
    it('returns an empty list when no adapters are registered', async () => {
      const result = await service.getProviders(orgId);
      expect(result).toEqual([]);
    });

    it('merges registry adapters with DB configs', async () => {
      const adapter = createMockAdapter('bitly', {
        name: 'Bitly',
        defaultDomain: 'bit.ly',
        authType: 'oauth2',
      });
      registry.register(adapter);
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { enabled: true, isActive: false, customDomain: 'my.com' }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        identifier: 'bitly',
        name: 'Bitly',
        enabled: true,
        isActive: false,
        isConfigured: false,
        customDomain: 'my.com',
        authType: 'oauth2',
        defaultDomain: 'bit.ly',
      });
    });

    it('returns isConfigured: true when all required credential fields are present', async () => {
      const adapter = createMockAdapter('bitly', { name: 'Bitly' });
      registry.register(adapter);
      const creds = JSON.stringify({ accessToken: 'token123' });
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { enabled: true, credentials: `encrypted:${creds}` }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(true);
    });

    it('returns isConfigured: false when required credential is empty', async () => {
      const adapter = createMockAdapter('bitly', { name: 'Bitly' });
      registry.register(adapter);
      const creds = JSON.stringify({ accessToken: '  ' });
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { credentials: `encrypted:${creds}` }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(false);
    });

    it('returns isConfigured: false when no DB config exists for adapter', async () => {
      registry.register(createMockAdapter('bitly'));
      (repository.getByOrg as any).mockResolvedValue([]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(false);
    });

    it('handles multiple adapters with mixed configs', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      registry.register(createMockAdapter('dub', { name: 'Dub.co' }));
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { enabled: true, isActive: true }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result).toHaveLength(2);
      const bitly = result.find((r) => r.identifier === 'bitly');
      const dub = result.find((r) => r.identifier === 'dub');
      expect(bitly?.enabled).toBe(true);
      expect(bitly?.isActive).toBe(true);
      expect(dub?.enabled).toBe(false);
      expect(dub?.isActive).toBe(false);
    });
  });

  describe('getActiveProvider', () => {
    it('returns null when no active config exists', async () => {
      (repository.getActive as any).mockResolvedValue(null);
      const result = await service.getActiveProvider(orgId);
      expect(result).toBeNull();
    });

    it('returns null when adapter is not in registry', async () => {
      (repository.getActive as any).mockResolvedValue(dbConfig('missing'));
      const result = await service.getActiveProvider(orgId);
      expect(result).toBeNull();
    });

    it('returns decrypted active provider with credentials', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      const creds = JSON.stringify({ accessToken: 'secret-token' });
      (repository.getActive as any).mockResolvedValue(
        dbConfig('bitly', { credentials: `encrypted:${creds}`, customDomain: 'my.link' }),
      );

      const result = await service.getActiveProvider(orgId);
      expect(result).toMatchObject({
        identifier: 'bitly',
        name: 'Bitly',
        customDomain: 'my.link',
      });
      expect(result?.credentials).toEqual({ accessToken: 'secret-token' });
    });

    it('returns empty credentials object when credentials is null', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      (repository.getActive as any).mockResolvedValue(dbConfig('bitly', { credentials: null }));

      const result = await service.getActiveProvider(orgId);
      expect(result?.credentials).toEqual({});
    });

    it('returns empty credentials on decrypt failure', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      (encryption.decrypt as any).mockImplementation(() => 'not-valid-json');
      (repository.getActive as any).mockResolvedValue(dbConfig('bitly', { credentials: 'bad-data' }));

      const result = await service.getActiveProvider(orgId);
      expect(result?.credentials).toEqual({});
    });
  });

  describe('upsert', () => {
    it('encrypts credentials before passing to repository', async () => {
      await service.upsert(orgId, 'bitly', {
        enabled: true,
        credentials: { accessToken: 'token123', groupGuid: 'g1' },
      });

      expect(encryption.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ accessToken: 'token123', groupGuid: 'g1' }),
      );
      expect(repository.upsert).toHaveBeenCalledWith(
        orgId,
        'bitly',
        expect.objectContaining({
          enabled: true,
          credentials: expect.stringContaining('encrypted:'),
        }),
      );
    });

    it('does not encrypt credentials when not provided', async () => {
      await service.upsert(orgId, 'bitly', { enabled: false, customDomain: 'my.link' });

      expect(encryption.encrypt).not.toHaveBeenCalled();
      expect(repository.upsert).toHaveBeenCalledWith(orgId, 'bitly', expect.objectContaining({
        enabled: false,
        customDomain: 'my.link',
        credentials: undefined,
      }));
    });

    it('encrypts extraConfig when provided as object', async () => {
      await service.upsert(orgId, 'bitly', {
        extraConfig: { clientId: 'cid', clientSecret: 'cs' },
      });

      expect(encryption.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ clientId: 'cid', clientSecret: 'cs' }),
      );
      expect(repository.upsert).toHaveBeenCalledWith(orgId, 'bitly', expect.objectContaining({
        extraConfig: expect.stringContaining('encrypted:'),
      }));
    });

    it('does not encrypt extraConfig when not provided', async () => {
      await service.upsert(orgId, 'bitly', { enabled: true });

      expect(repository.upsert).toHaveBeenCalledWith(orgId, 'bitly', expect.objectContaining({
        extraConfig: undefined,
      }));
    });
  });

  describe('setActive', () => {
    it('throws when config does not exist for the org', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(null);
      await expect(service.setActive(orgId, 'bitly'))
        .rejects.toThrow('not configured for this organization');
    });

    it('throws when adapter is not in the registry', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${JSON.stringify({ accessToken: 't' })}`,
      }));
      await expect(service.setActive(orgId, 'bitly'))
        .rejects.toThrow('Unknown short-link provider');
    });

    it('throws when required credentials are missing', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${JSON.stringify({ accessToken: '  ' })}`,
      }));
      await expect(service.setActive(orgId, 'bitly'))
        .rejects.toThrow('not fully configured');
    });

    it('calls repository.setActive when validation passes', async () => {
      registry.register(createMockAdapter('bitly', { name: 'Bitly' }));
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${JSON.stringify({ accessToken: 'valid-token' })}`,
      }));
      await service.setActive(orgId, 'bitly');
      expect(repository.setActive).toHaveBeenCalledWith(orgId, 'bitly');
    });
  });

  describe('delete', () => {
    it('delegates to repository.delete', async () => {
      await service.delete(orgId, 'bitly');
      expect(repository.delete).toHaveBeenCalledWith(orgId, 'bitly');
    });
  });

  describe('testConnection', () => {
    it('throws when config does not exist', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(null);
      await expect(service.testConnection(orgId, 'bitly'))
        .rejects.toThrow('not configured for this organization');
    });

    it('throws when adapter is not in registry', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly'));
      await expect(service.testConnection(orgId, 'bitly'))
        .rejects.toThrow('Unknown short-link provider');
    });

    it('calls adapter.validateCredentials with decrypted credentials', async () => {
      const adapter = createMockAdapter('bitly', { name: 'Bitly' });
      registry.register(adapter);
      const creds = JSON.stringify({ accessToken: 'test-token' });
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${creds}`,
        customDomain: 'my.link',
        extraConfig: `encrypted:${JSON.stringify({ feature: 'enabled' })}`,
      }));

      const result = await service.testConnection(orgId, 'bitly');
      expect(result).toEqual({ ok: true });
      expect(adapter.validateCredentials).toHaveBeenCalledWith({
        orgId,
        credentials: { accessToken: 'test-token' },
        customDomain: 'my.link',
        extraConfig: { feature: 'enabled' },
      });
    });

    it('returns ok: false from adapter', async () => {
      const adapter = createMockAdapter('bitly', { name: 'Bitly' });
      adapter.validateCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'Auth failed' });
      registry.register(adapter);
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${JSON.stringify({ accessToken: 'bad' })}`,
      }));

      const result = await service.testConnection(orgId, 'bitly');
      expect(result).toEqual({ ok: false, error: 'Auth failed' });
    });

    it('handles missing extraConfig gracefully', async () => {
      const adapter = createMockAdapter('bitly', { name: 'Bitly' });
      registry.register(adapter);
      (repository.getByIdentifier as any).mockResolvedValue(dbConfig('bitly', {
        credentials: `encrypted:${JSON.stringify({ accessToken: 'tok' })}`,
      }));

      await service.testConnection(orgId, 'bitly');
      expect(adapter.validateCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ extraConfig: {} }),
      );
    });
  });

  describe('getConfigForProvider', () => {
    it('returns null when no config exists', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(null);

      const result = await service.getConfigForProvider(orgId, 'bitly');
      expect(result).toBeNull();
    });

    it('returns decrypted credentials and parsed extraConfig', async () => {
      const creds = JSON.stringify({ accessToken: 'tok' });
      (repository.getByIdentifier as any).mockResolvedValue(
        dbConfig('bitly', {
          credentials: `encrypted:${creds}`,
          extraConfig: `encrypted:${JSON.stringify({ clientId: 'cid', clientSecret: 'cs' })}`,
        }),
      );

      const result = await service.getConfigForProvider(orgId, 'bitly');
      expect(result).toEqual({
        credentials: { accessToken: 'tok' },
        extraConfig: { clientId: 'cid', clientSecret: 'cs' },
      });
    });

    it('handles legacy plaintext extraConfig', async () => {
      const creds = JSON.stringify({ accessToken: 'tok' });
      (repository.getByIdentifier as any).mockResolvedValue(
        dbConfig('bitly', {
          credentials: `encrypted:${creds}`,
          extraConfig: JSON.stringify({ clientId: 'cid' }),
        }),
      );

      const result = await service.getConfigForProvider(orgId, 'bitly');
      expect(result?.extraConfig).toEqual({ clientId: 'cid' });
    });

    it('returns empty extraConfig on invalid JSON', async () => {
      (repository.getByIdentifier as any).mockResolvedValue(
        dbConfig('bitly', {
          credentials: `encrypted:${JSON.stringify({ accessToken: 'tok' })}`,
          extraConfig: 'not-json-at-all',
        }),
      );

      const result = await service.getConfigForProvider(orgId, 'bitly');
      expect(result?.extraConfig).toEqual({});
    });
  });

  describe('isConfigured helper', () => {
    it('returns false when no DB config', async () => {
      registry.register(createMockAdapter('bitly'));
      (repository.getByOrg as any).mockResolvedValue([]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(false);
    });

    it('returns false when credentials are null', async () => {
      registry.register(createMockAdapter('bitly'));
      (repository.getByOrg as any).mockResolvedValue([dbConfig('bitly', { credentials: null })]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(false);
    });

    it('returns false when a required field has empty value', async () => {
      registry.register(createMockAdapter('bitly'));
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { credentials: `encrypted:${JSON.stringify({ accessToken: '' })}` }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(false);
    });

    it('returns true when all required fields have non-empty values', async () => {
      registry.register(createMockAdapter('bitly'));
      (repository.getByOrg as any).mockResolvedValue([
        dbConfig('bitly', { credentials: `encrypted:${JSON.stringify({ accessToken: 'valid' })}` }),
      ]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(true);
    });

    it('returns true when adapter has no required credential fields', async () => {
      const adapter = createMockAdapter('simple', {
        name: 'Simple',
        fields: [{ key: 'note', label: 'Note', type: 'string', required: false }],
      });
      registry.register(adapter);
      (repository.getByOrg as any).mockResolvedValue([dbConfig('simple')]);

      const result = await service.getProviders(orgId);
      expect(result[0].isConfigured).toBe(true);
    });
  });
});
