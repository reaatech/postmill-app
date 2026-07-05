import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailAdapterRegistry } from './email-adapter.registry';
import { EmailAdapter } from './email-adapter.interface';

const makeAdapter = (
  name: string,
  isConfigured: boolean = true,
): EmailAdapter => ({
  name,
  capabilities: { webhooks: false, openTracking: false, clickTracking: false },
  requiredEnvKeys: [],
  isConfigured: vi.fn().mockReturnValue(isConfigured),
  send: vi.fn().mockResolvedValue({}),
});

describe('EmailAdapterRegistry', () => {
  let registry: EmailAdapterRegistry;

  beforeEach(() => {
    delete process.env.EMAIL_PROVIDER;
    registry = new EmailAdapterRegistry();
  });

  afterEach(() => {
    delete process.env.EMAIL_PROVIDER;
  });

  describe('register', () => {
    it('adds an adapter to the map', () => {
      const adapter = makeAdapter('mailgun');

      registry.register(adapter);

      expect(registry.getAdapter('mailgun')).toBe(adapter);
    });
  });

  describe('getAdapter', () => {
    it('returns the registered adapter by name', () => {
      const adapter = makeAdapter('mailgun');
      registry.register(adapter);

      const result = registry.getAdapter('mailgun');

      expect(result).toBe(adapter);
    });

    it('returns undefined for unknown name', () => {
      const result = registry.getAdapter('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getActiveAdapter', () => {
    // 4.9: getActiveAdapter resolves through ProviderResolutionService.resolveEmail
    // (kernel + telemetry proxy). Build a minimal fake resolution that maps
    // provider ids to the supplied adapters and throws on unknown ids (as the real
    // resolveForRead does for a missing provider).
    const makeResolution = (adapters: Record<string, EmailAdapter>) => ({
      resolveEmail: vi.fn((id: string) => {
        if (!adapters[id]) throw new Error(`not found: ${id}`);
        return adapters[id];
      }),
    });

    const buildRegistry = (adapters: Record<string, EmailAdapter>) =>
      new EmailAdapterRegistry(makeResolution(adapters) as any);

    it('resolves email through ProviderResolutionService.resolveEmail (telemetry-wrapped)', () => {
      const mailgun = makeAdapter('mailgun');
      const empty = makeAdapter('empty');
      const resolution = makeResolution({ mailgun, empty });
      const reg = new EmailAdapterRegistry(resolution as any);
      process.env.EMAIL_PROVIDER = 'mailgun';

      reg.getActiveAdapter();

      expect(resolution.resolveEmail).toHaveBeenCalledWith('mailgun', {});
    });

    it('passes a qualified EMAIL_PROVIDER version to resolveEmail', () => {
      const mailgun = makeAdapter('mailgun');
      const empty = makeAdapter('empty');
      const resolution = makeResolution({ mailgun, empty });
      const reg = new EmailAdapterRegistry(resolution as any);
      process.env.EMAIL_PROVIDER = 'mailgun@v2';

      reg.getActiveAdapter();

      expect(resolution.resolveEmail).toHaveBeenCalledWith('mailgun', { version: 'v2' });
    });

    it('returns the adapter matching EMAIL_PROVIDER env var when configured', () => {
      const mailgun = makeAdapter('mailgun');
      const empty = makeAdapter('empty');
      const reg = buildRegistry({ mailgun, empty });
      process.env.EMAIL_PROVIDER = 'mailgun';

      const result = reg.getActiveAdapter();

      expect(result).toBe(mailgun);
    });

    it('returns empty adapter when EMAIL_PROVIDER is unset', () => {
      const empty = makeAdapter('empty');
      const reg = buildRegistry({ empty });

      const result = reg.getActiveAdapter();

      expect(result).toBe(empty);
    });

    it('returns empty adapter when EMAIL_PROVIDER points to unknown provider', () => {
      const empty = makeAdapter('empty');
      const reg = buildRegistry({ empty });
      process.env.EMAIL_PROVIDER = 'nonexistent';

      const result = reg.getActiveAdapter();

      expect(result).toBe(empty);
    });

    it("returns empty adapter when the provider's adapter isConfigured() returns false", () => {
      const mailgun = makeAdapter('mailgun', false);
      const empty = makeAdapter('empty');
      const reg = buildRegistry({ mailgun, empty });
      process.env.EMAIL_PROVIDER = 'mailgun';

      const result = reg.getActiveAdapter();

      expect(result).toBe(empty);
    });
  });

  describe('list', () => {
    it('returns all registered adapters', () => {
      const mailgun = makeAdapter('mailgun');
      const empty = makeAdapter('empty');
      registry.register(mailgun);
      registry.register(empty);

      const result = registry.list();

      expect(result).toHaveLength(2);
      expect(result).toContain(mailgun);
      expect(result).toContain(empty);
    });
  });
});
