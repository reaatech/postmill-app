import { describe, it, expect } from 'vitest';
import { Agent, ProxyAgent } from 'undici';
import { buildVpnDispatcher } from './vpn-dispatcher.factory';
import { VpnProxyRegion } from './vpn.types';

const auth = { username: 'user', password: 'pass' };

describe('buildVpnDispatcher', () => {
  it('builds a SOCKS5 dispatcher as a plain undici Agent', () => {
    const region: VpnProxyRegion = {
      id: 'us-atlanta',
      label: 'US Atlanta',
      host: 'atlanta.us.socks.nordhold.net',
      port: 1080,
      protocol: 'socks5',
    };
    const d = buildVpnDispatcher(region, auth);
    expect(d).toBeInstanceOf(Agent);
    expect(d).not.toBeInstanceOf(ProxyAgent);
    void d.close();
  });

  it('builds an HTTP-CONNECT dispatcher as an undici ProxyAgent', () => {
    const region: VpnProxyRegion = {
      id: 'http-eu',
      label: 'EU proxy',
      host: 'proxy.example.com',
      port: 8080,
      protocol: 'http-connect',
    };
    const d = buildVpnDispatcher(region, auth);
    expect(d).toBeInstanceOf(ProxyAgent);
    void d.close();
  });

  it('rejects a proxy host that is a literal private/loopback IP', () => {
    const region: VpnProxyRegion = {
      id: 'evil',
      label: 'Loopback',
      host: '127.0.0.1',
      port: 1080,
      protocol: 'socks5',
    };
    expect(() => buildVpnDispatcher(region, auth)).toThrow(/not a public endpoint/);
  });

  it('rejects a private-range HTTP proxy host too', () => {
    const region: VpnProxyRegion = {
      id: 'lan',
      label: 'LAN',
      host: '10.0.0.5',
      port: 8080,
      protocol: 'http-connect',
    };
    expect(() => buildVpnDispatcher(region, auth)).toThrow(/not a public endpoint/);
  });
});
