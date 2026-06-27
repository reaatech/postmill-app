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
import { OrgVpnConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/vpn/org-vpn-config.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';

describe('OrgVpnConfigService', () => {
  let service: OrgVpnConfigService;
  let repository: OrgVpnConfigRepository;
  let encryption: EncryptionService;
  let registry: VpnProviderRegistry;

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
    );

    service = new OrgVpnConfigService(repository, encryption, registry);
  });

  it('returns provider metadata with all adapters', () => {
    const meta = service.getProviderMetadata();
    expect(meta).toHaveLength(15);
    expect(meta.map((m) => m.identifier).sort()).toEqual([
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
  });
});
