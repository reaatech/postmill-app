import { describe, it, expect } from 'vitest';
import { PROVIDER_CAPABILITIES } from '../social-capabilities';

describe('PROVIDER_CAPABILITIES', () => {
  it('exposes a mastodon-custom entry that mirrors mastodon', () => {
    expect(PROVIDER_CAPABILITIES['mastodon-custom']).toBeDefined();
    expect(PROVIDER_CAPABILITIES['mastodon-custom']).toEqual(
      PROVIDER_CAPABILITIES['mastodon']
    );
  });
});
