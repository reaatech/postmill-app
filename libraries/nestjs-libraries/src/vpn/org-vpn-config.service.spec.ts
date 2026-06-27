import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgVpnConfigService } from './org-vpn-config.service';
import { VpnProviderRegistry } from './vpn-provider.registry';
import { NordvpnAdapter } from './adapters/nordvpn.adapter';
import { ExpressvpnAdapter } from './adapters/expressvpn.adapter';
import { SurfsharkAdapter } from './adapters/surfshark.adapter';
import { ProtonvpnAdapter } from './adapters/protonvpn.adapter';
import { MullvadAdapter } from './adapters/mullvad.adapter';
import { CyberghostAdapter } from './adapters/cyberghost.adapter';
import { PiaAdapter } from './adapters/pia.adapter';
import { IpvanishAdapter } from './adapters/ipvanish.adapter';
import { WindscribeAdapter } from './adapters/windscribe.adapter';
import { TunnelbearAdapter } from './adapters/tunnelbear.adapter';
import { HotspotshieldAdapter } from './adapters/hotspotshield.adapter';
import { PurevpnAdapter } from './adapters/purevpn.adapter';
import { VyprvpnAdapter } from './adapters/vyprvpn.adapter';
import { HidemeAdapter } from './adapters/hideme.adapter';
import { MozillavpnAdapter } from './adapters/mozillavpn.adapter';
import { CustomProxyAdapter } from './adapters/custom-proxy.adapter';
import { OrgVpnConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/vpn/org-vpn-config.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { VpnDispatcherService } from './vpn-dispatcher.service';

describe('OrgVpnConfigService', () => {
  let service: OrgVpnConfigService;
  let repository: OrgVpnConfigRepository;
  let encryption: EncryptionService;
  let registry: VpnProviderRegistry;
  let dispatcher: VpnDispatcherService;

  beforeEach(() => {
    repository = {
      getByOrg: vi.fn().mockResolvedValue([]),
      getByIdentifier: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((_orgId, identifier, data) =>
        Promise.resolve({ id: 'cfg-1', identifier, ...data }),
      ),
      delete: vi.fn().mockResolvedValue({ count: 1 }),
    } as unknown as OrgVpnConfigRepository;

    encryption = {
      encrypt: vi.fn((value: string) => `enc:${value}`),
      decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
      encryptDeterministic: vi.fn(),
    } as unknown as EncryptionService;

    registry = new VpnProviderRegistry(
      new NordvpnAdapter(),
      new ExpressvpnAdapter(),
      new SurfsharkAdapter(),
      new ProtonvpnAdapter(),
      new MullvadAdapter(),
      new CyberghostAdapter(),
      new PiaAdapter(),
      new IpvanishAdapter(),
      new WindscribeAdapter(),
      new TunnelbearAdapter(),
      new HotspotshieldAdapter(),
      new PurevpnAdapter(),
      new VyprvpnAdapter(),
      new HidemeAdapter(),
      new MozillavpnAdapter(),
      new CustomProxyAdapter(),
    );

    dispatcher = { invalidate: vi.fn() } as unknown as VpnDispatcherService;

    service = new OrgVpnConfigService(repository, encryption, registry, dispatcher);
  });

  it('returns provider metadata with all adapters', () => {
    const meta = service.getProviderMetadata();
    expect(meta).toHaveLength(16);
    expect(meta.map((m) => m.identifier).sort()).toEqual([
      'custom',
      'cyberghost',
      'expressvpn',
      'hideme',
      'hotspotshield',
      'ipvanish',
      'mozillavpn',
      'mullvad',
      'nordvpn',
      'pia',
      'protonvpn',
      'purevpn',
      'surfshark',
      'tunnelbear',
      'vyprvpn',
      'windscribe',
    ]);
    expect(meta.find((m) => m.identifier === 'custom')!.isDynamicRegions).toBe(true);
    expect(meta.find((m) => m.identifier === 'nordvpn')!.isDynamicRegions).toBe(false);
  });

  it('marks provider configured when required credentials are present', async () => {
    vi.spyOn(repository, 'getByOrg').mockResolvedValue([
      {
        id: 'cfg-1',
        organizationId: 'org-1',
        identifier: 'nordvpn',
        name: null,
        credentials: `enc:{"serviceCredentials":"user:pass"}`,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    const providers = await service.getProviders('org-1');
    const nordvpn = providers.find((p) => p.identifier === 'nordvpn')!;
    expect(nordvpn.isConfigured).toBe(true);
    expect(nordvpn.enabled).toBe(true);

    const mullvad = providers.find((p) => p.identifier === 'mullvad')!;
    expect(mullvad.isConfigured).toBe(false);
  });

  it('encrypts credentials on upsert and validates first', async () => {
    await service.upsert('org-1', 'nordvpn', {
      name: 'Home NordVPN',
      credentials: { serviceCredentials: 'user:pass' },
      enabled: true,
    });

    expect(encryption.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ serviceCredentials: 'user:pass' }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      'org-1',
      'nordvpn',
      expect.objectContaining({ enabled: true, name: 'Home NordVPN' }),
    );
  });

  it('throws on invalid credentials', async () => {
    await expect(
      service.upsert('org-1', 'nordvpn', {
        credentials: { serviceCredentials: 'nocolon' },
      }),
    ).rejects.toThrow(/Service credentials must be in the format/);
  });

  it('deletes provider config', async () => {
    await service.delete('org-1', 'nordvpn');
    expect(repository.delete).toHaveBeenCalledWith('org-1', 'nordvpn');
    expect(dispatcher.invalidate).toHaveBeenCalledWith('org-1', 'nordvpn');
  });

  describe('regions', () => {
    const enabledRow = {
      id: 'cfg-1',
      organizationId: 'org-1',
      identifier: 'nordvpn',
      name: null,
      credentials: `enc:{"serviceCredentials":"user:pass"}`,
      regions: JSON.stringify(['us-atlanta', 'nl-amsterdam']),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it('lists enabled provider×region combos with labels', async () => {
      vi.spyOn(repository, 'getByOrg').mockResolvedValue([enabledRow]);
      const list = await service.listEnabledRegions('org-1');
      expect(list).toHaveLength(2);
      expect(list.map((r) => r.regionId).sort()).toEqual(['nl-amsterdam', 'us-atlanta']);
      expect(list[0].providerName).toBe('NordVPN');
      expect(list.find((r) => r.regionId === 'us-atlanta')?.regionLabel).toContain('Atlanta');
    });

    it('excludes a disabled provider from enabled regions', async () => {
      vi.spyOn(repository, 'getByOrg').mockResolvedValue([{ ...enabledRow, enabled: false }]);
      expect(await service.listEnabledRegions('org-1')).toHaveLength(0);
    });

    it('drops enabled region ids no longer in the adapter catalog', async () => {
      vi.spyOn(repository, 'getByOrg').mockResolvedValue([
        { ...enabledRow, regions: JSON.stringify(['us-atlanta', 'ghost-region']) },
      ]);
      const providers = await service.getProviders('org-1');
      const nord = providers.find((p) => p.identifier === 'nordvpn')!;
      expect(nord.enabledRegions).toEqual(['us-atlanta']);
      expect(nord.proxyRegions.length).toBeGreaterThan(0);
    });

    it('resolves a selected region into region + auth + fingerprint', async () => {
      vi.spyOn(repository, 'getByIdentifier').mockResolvedValue(enabledRow);
      const resolved = await service.resolveProxyForChannel('org-1', 'nordvpn', 'us-atlanta');
      expect(resolved).not.toBeNull();
      expect(resolved!.region.host).toContain('atlanta');
      expect(resolved!.auth).toEqual({ username: 'user', password: 'pass' });
      expect(resolved!.credsFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns null for a region the org did not enable', async () => {
      vi.spyOn(repository, 'getByIdentifier').mockResolvedValue(enabledRow);
      expect(await service.resolveProxyForChannel('org-1', 'nordvpn', 'se-stockholm')).toBeNull();
    });

    it('returns null when the provider is disabled', async () => {
      vi.spyOn(repository, 'getByIdentifier').mockResolvedValue({ ...enabledRow, enabled: false });
      expect(await service.resolveProxyForChannel('org-1', 'nordvpn', 'us-atlanta')).toBeNull();
    });

    it('invalidates pooled dispatchers on upsert', async () => {
      await service.upsert('org-1', 'nordvpn', { regions: ['us-atlanta'] });
      expect(dispatcher.invalidate).toHaveBeenCalledWith('org-1', 'nordvpn');
    });
  });

  describe('custom proxy (dynamic regions)', () => {
    const customRow = {
      id: 'cfg-custom',
      organizationId: 'org-1',
      identifier: 'custom',
      name: null,
      credentials: `enc:${JSON.stringify({
        label: 'Office VPN',
        host: 'proxy.acme.example',
        port: '1080',
        protocol: 'socks5',
        username: 'me',
        password: 'pw',
      })}`,
      regions: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it('derives a single region from the stored endpoint and auto-enables it', async () => {
      vi.spyOn(repository, 'getByOrg').mockResolvedValue([customRow]);
      const providers = await service.getProviders('org-1');
      const custom = providers.find((p) => p.identifier === 'custom')!;
      expect(custom.isDynamicRegions).toBe(true);
      expect(custom.proxyRegions).toHaveLength(1);
      expect(custom.proxyRegions[0].label).toBe('Office VPN');
      expect(custom.enabledRegions).toEqual(['custom']);
    });

    it('lists the derived region without any stored region toggle', async () => {
      vi.spyOn(repository, 'getByOrg').mockResolvedValue([customRow]);
      const list = await service.listEnabledRegions('org-1');
      expect(list).toEqual([
        { identifier: 'custom', providerName: 'Custom VPN / Proxy', regionId: 'custom', regionLabel: 'Office VPN' },
      ]);
    });

    it('resolves the custom endpoint + auth for a channel', async () => {
      vi.spyOn(repository, 'getByIdentifier').mockResolvedValue(customRow);
      const resolved = await service.resolveProxyForChannel('org-1', 'custom', 'custom');
      expect(resolved!.region.host).toBe('proxy.acme.example');
      expect(resolved!.region.protocol).toBe('socks5');
      expect(resolved!.auth).toEqual({ username: 'me', password: 'pw' });
    });

    it('supports a no-auth custom proxy', async () => {
      const noAuth = {
        ...customRow,
        credentials: `enc:${JSON.stringify({
          label: 'Open proxy',
          host: 'proxy.acme.example',
          port: '8080',
          protocol: 'http-connect',
        })}`,
      };
      vi.spyOn(repository, 'getByIdentifier').mockResolvedValue(noAuth);
      const resolved = await service.resolveProxyForChannel('org-1', 'custom', 'custom');
      expect(resolved!.auth).toEqual({ username: '', password: '' });
      expect(resolved!.region.protocol).toBe('http-connect');
    });
  });
});
