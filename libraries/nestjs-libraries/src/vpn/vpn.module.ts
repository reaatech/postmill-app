import { Global, Module } from '@nestjs/common';
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
import { OrgVpnConfigService } from './org-vpn-config.service';
import { OrgVpnConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/vpn/org-vpn-config.repository';

@Global()
@Module({
  providers: [
    NordvpnAdapter,
    ExpressvpnAdapter,
    SurfsharkAdapter,
    ProtonvpnAdapter,
    MullvadAdapter,
    CyberghostAdapter,
    PiaAdapter,
    IpvanishAdapter,
    WindscribeAdapter,
    TunnelbearAdapter,
    HotspotshieldAdapter,
    PurevpnAdapter,
    VyprvpnAdapter,
    HidemeAdapter,
    MozillavpnAdapter,
    VpnProviderRegistry,
    OrgVpnConfigService,
    OrgVpnConfigRepository,
  ],
  exports: [VpnProviderRegistry, OrgVpnConfigService, OrgVpnConfigRepository],
})
export class VpnModule {}
