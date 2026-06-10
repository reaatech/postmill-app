import { describe, it, expect, beforeEach } from 'vitest';
import { ShortLinkRegistry } from './short-link.registry';
import type { ShortLinkAdapter, ShortLinkCapabilities } from './short-link.interface';

const mockCapabilities: ShortLinkCapabilities = {
  create: true,
  expand: false,
  statistics: false,
  bulkStatistics: false,
  customDomain: false,
};

const createMockAdapter = (id: string, caps?: Partial<ShortLinkCapabilities>): ShortLinkAdapter => ({
  identifier: id,
  name: `Adapter ${id}`,
  credentialFields: [],
  capabilities: { ...mockCapabilities, ...caps },
  authType: 'apiKey',
  resolveDomain: () => id,
  validateCredentials: async () => ({ ok: true }),
  createShortLink: async () => ({ shortUrl: `https://${id}/abc` }),
});

describe('ShortLinkRegistry', () => {
  let registry: ShortLinkRegistry;

  beforeEach(() => {
    registry = new ShortLinkRegistry();
  });

  describe('register', () => {
    it('registers an adapter by identifier', () => {
      const adapter = createMockAdapter('bitly');
      registry.register(adapter);
      expect(registry.getAdapter('bitly')).toBe(adapter);
    });

    it('overwrites an existing adapter with the same identifier', () => {
      const first = createMockAdapter('dup', { create: true });
      const second = createMockAdapter('dup', { create: false });
      registry.register(first);
      registry.register(second);
      expect(registry.getAdapter('dup')).toBe(second);
      expect(registry.getAdapter('dup')?.capabilities.create).toBe(false);
    });
  });

  describe('getAdapter', () => {
    it('returns undefined for an unknown identifier', () => {
      expect(registry.getAdapter('nonexistent')).toBeUndefined();
    });

    it('returns the registered adapter', () => {
      const adapter = createMockAdapter('known');
      registry.register(adapter);
      expect(registry.getAdapter('known')).toBe(adapter);
    });
  });

  describe('list', () => {
    it('returns an empty array when no adapters are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered adapters', () => {
      registry.register(createMockAdapter('a'));
      registry.register(createMockAdapter('b'));
      registry.register(createMockAdapter('c'));
      expect(registry.list()).toHaveLength(3);
    });
  });

  describe('capabilitiesFor', () => {
    it('returns capabilities for a known adapter', () => {
      const adapter = createMockAdapter('stats-provider', {
        statistics: true,
        bulkStatistics: true,
      });
      registry.register(adapter);
      const caps = registry.capabilitiesFor('stats-provider');
      expect(caps?.create).toBe(true);
      expect(caps?.statistics).toBe(true);
      expect(caps?.bulkStatistics).toBe(true);
      expect(caps?.expand).toBe(false);
    });

    it('returns undefined for an unknown adapter', () => {
      expect(registry.capabilitiesFor('unknown')).toBeUndefined();
    });
  });
});
