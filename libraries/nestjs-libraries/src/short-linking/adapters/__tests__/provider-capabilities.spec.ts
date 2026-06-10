import { describe, it, expect } from 'vitest';
import { ShortLinkRegistry } from '../../short-link.registry';
import { BitlyAdapter } from '../bitly.adapter';
import { BlinkAdapter } from '../blink.adapter';
import { CleanuriAdapter } from '../cleanuri.adapter';
import { CuttlyAdapter } from '../cuttly.adapter';
import { DubAdapter } from '../dub.adapter';
import { IsgdAdapter } from '../isgd.adapter';
import { LinklyAdapter } from '../linkly.adapter';
import { OwlyAdapter } from '../owly.adapter';
import { PixelmeAdapter } from '../pixelme.adapter';
import { RebrandlyAdapter } from '../rebrandly.adapter';
import { ReplugAdapter } from '../replug.adapter';
import { ShortioAdapter } from '../shortio.adapter';
import { SniplyAdapter } from '../sniply.adapter';
import { SwitchyAdapter } from '../switchy.adapter';
import { T2mAdapter } from '../t2m.adapter';
import { TinyccAdapter } from '../tinycc.adapter';
import { TinyurlAdapter } from '../tinyurl.adapter';
import { TlyAdapter } from '../tly.adapter';
import { VgdAdapter } from '../vgd.adapter';

describe('Short-link provider capabilities (documented counts)', () => {
  const registry = new ShortLinkRegistry();

  const adapters = [
    new BitlyAdapter(),
    new BlinkAdapter(),
    new CleanuriAdapter(),
    new CuttlyAdapter(),
    new DubAdapter(),
    new IsgdAdapter(),
    new LinklyAdapter(),
    new OwlyAdapter(),
    new PixelmeAdapter(),
    new RebrandlyAdapter(),
    new ReplugAdapter(),
    new ShortioAdapter(),
    new SniplyAdapter(),
    new SwitchyAdapter(),
    new T2mAdapter(),
    new TinyccAdapter(),
    new TinyurlAdapter(),
    new TlyAdapter(),
    new VgdAdapter(),
  ];

  for (const adapter of adapters) {
    registry.register(adapter);
  }

  it('has exactly 19 registered adapters', () => {
    expect(registry.list()).toHaveLength(19);
  });

  it('has exactly 10 adapters with statistics: true', () => {
    const withStats = registry.list().filter(a => a.capabilities.statistics);
    expect(withStats).toHaveLength(10);
  });

  it('has exactly 13 adapters with customDomain: true', () => {
    const withCustomDomain = registry.list().filter(a => a.capabilities.customDomain);
    expect(withCustomDomain).toHaveLength(13);
  });
});
