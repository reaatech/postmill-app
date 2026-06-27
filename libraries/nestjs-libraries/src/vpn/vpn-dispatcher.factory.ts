import { Agent, ProxyAgent, buildConnector, Dispatcher } from 'undici';
import dns from 'node:dns';
import net from 'node:net';
import { SocksClient } from 'socks';
import { isBlockedIp } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { VpnProxyAuth, VpnProxyRegion } from './vpn.types';

const CONNECT_TIMEOUT = 10_000;

// SSRF lookup hook (mirrors ssrfSafeDispatcher) — applied to the leg that
// connects to the proxy itself so the hop to the proxy can't be redirected to a
// private IP via DNS.
const ssrfLookup: net.LookupFunction = (hostname, options, callback) => {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    return (options as any) && (options as any).all
      ? callback(null, [{ address: hostname, family }] as any, family)
      : callback(null, hostname, family);
  }

  dns.lookup(hostname, options as any, (err, address: any, family: any) => {
    if (err) return callback(err, '', 0);
    if (Array.isArray(address)) {
      for (const entry of address) {
        if (isBlockedIp(entry.address)) {
          return callback(new Error('Blocked IP'), '', 0);
        }
      }
      return callback(null, address as any, 0);
    }
    if (isBlockedIp(address)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    callback(null, address, family);
  });
};

// Build an undici Dispatcher that egresses through a VPN region's proxy.
// SOCKS5 has no native undici support — we open the socket via the `socks`
// package and hand the connected socket to undici's own connector so undici
// still owns TLS/ALPN/cert validation. HTTP-CONNECT uses undici's ProxyAgent.
export function buildVpnDispatcher(
  region: VpnProxyRegion,
  auth: VpnProxyAuth,
): Dispatcher {
  // Reject a proxy pointed at a literal private/loopback IP. Hostnames are
  // additionally pinned at connect time by ssrfLookup (SOCKS path) / the
  // ProxyAgent connect hook (HTTP path).
  if (net.isIP(region.host) && isBlockedIp(region.host)) {
    throw new Error(`VPN proxy host is not a public endpoint: ${region.host}`);
  }

  if (region.protocol === 'http-connect') {
    const token =
      'Basic ' +
      Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    return new ProxyAgent({
      uri: `http://${region.host}:${region.port}`,
      token,
      connect: { lookup: ssrfLookup, timeout: CONNECT_TIMEOUT },
    });
  }

  const connector = buildConnector({ timeout: CONNECT_TIMEOUT });
  return new Agent({
    connect(opts: any, callback: any) {
      SocksClient.createConnection({
        proxy: {
          host: region.host,
          port: region.port,
          type: 5,
          userId: auth.username,
          password: auth.password,
        },
        command: 'connect',
        destination: {
          host: opts.hostname,
          port: Number(opts.port) || 443,
        },
        timeout: CONNECT_TIMEOUT,
      })
        .then(({ socket }) => {
          // Let undici upgrade the raw SOCKS socket to TLS (ALPN/H2, cert check).
          connector({ ...opts, httpSocket: socket }, callback);
        })
        .catch((err: Error) => callback(err, null));
    },
  });
}
