import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from './vpn-provider.interface';
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

@Injectable()
export class VpnProviderRegistry {
  private readonly _adapters = new Map<string, VpnProviderAdapter>();

  constructor(
    nordvpn: NordvpnAdapter,
    expressvpn: ExpressvpnAdapter,
    surfshark: SurfsharkAdapter,
    protonvpn: ProtonvpnAdapter,
    mullvad: MullvadAdapter,
    cyberghost: CyberghostAdapter,
    pia: PiaAdapter,
    ipvanish: IpvanishAdapter,
    windscribe: WindscribeAdapter,
    tunnelbear: TunnelbearAdapter,
    hotspotshield: HotspotshieldAdapter,
    purevpn: PurevpnAdapter,
    vyprvpn: VyprvpnAdapter,
    hideme: HidemeAdapter,
    mozillavpn: MozillavpnAdapter,
    customProxy: CustomProxyAdapter,
  ) {
    this.register(nordvpn);
    this.register(expressvpn);
    this.register(surfshark);
    this.register(protonvpn);
    this.register(mullvad);
    this.register(cyberghost);
    this.register(pia);
    this.register(ipvanish);
    this.register(windscribe);
    this.register(tunnelbear);
    this.register(hotspotshield);
    this.register(purevpn);
    this.register(vyprvpn);
    this.register(hideme);
    this.register(mozillavpn);
    this.register(customProxy);
  }

  register(adapter: VpnProviderAdapter): void {
    this._adapters.set(adapter.identifier, adapter);
  }

  getAdapter(identifier: string): VpnProviderAdapter | undefined {
    return this._adapters.get(identifier);
  }

  list(): VpnProviderAdapter[] {
    return Array.from(this._adapters.values());
  }
}
