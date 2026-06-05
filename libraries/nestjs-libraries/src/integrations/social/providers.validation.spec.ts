import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

vi.mock('sharp', () => ({ default: vi.fn(() => ({ metadata: vi.fn() })) }));
vi.mock('@temporalio/activity', () => ({ ApplicationFailure: class {} }));
vi.mock('ws', () => ({ default: class MockWs {} }));
vi.mock('@gitroom/helpers/utils/timer', () => ({ timer: vi.fn() }));
vi.mock('@gitroom/helpers/utils/read.or.fetch', () => ({ readOrFetch: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(), ProviderConfiguration: class {}, Integration: class {} }));
vi.mock('@gitroom/helpers/auth/auth.service', () => ({ AuthService: { fixedEncryption: vi.fn((s: string) => s), fixedDecryption: vi.fn((s: string) => s) } }));
vi.mock('@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.service', () => ({
  ProviderConfigService: vi.fn(() => ({ getAll: vi.fn().mockResolvedValue([]), getByIdentifier: vi.fn(), decryptConfig: vi.fn(() => ({})), upsert: vi.fn(), delete: vi.fn() })),
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.repository', () => ({
  ProviderConfigRepository: vi.fn(() => ({ getAll: vi.fn(), getByIdentifier: vi.fn(), upsert: vi.fn(), delete: vi.fn(), setEnabled: vi.fn() })),
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: vi.fn(() => ({ model: {} })),
  PrismaService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/integrations/credentials', () => ({
  getEnvOr: () => 'mock-value',
  setCredentials: vi.fn(),
  getCredential: vi.fn(() => undefined),
  clearCredentials: vi.fn(),
  replaceCredentialsMap: vi.fn(),
}));

import { socialIntegrationList } from '../integration.manager';

describe('Provider structural validation', () => {
  it('has at least 30 providers', () => {
    expect(socialIntegrationList.length).toBeGreaterThanOrEqual(30);
  });

  it('all identifiers are unique and lowercase', () => {
    const ids = socialIntegrationList.map((p) => p.identifier);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('all providers have name, editor, scopes, maxLength', () => {
    for (const p of socialIntegrationList) {
      expect(p.name).toBeTruthy();
      expect(['none', 'normal', 'markdown', 'html']).toContain(p.editor);
      expect(Array.isArray(p.scopes)).toBe(true);
      expect(typeof p.maxLength).toBe('function');
      expect(p.maxConcurrentJob).toBeGreaterThan(0);
      expect(typeof p.isBetweenSteps).toBe('boolean');
    }
  });

  it('all providers have required methods', () => {
    for (const p of socialIntegrationList) {
      expect(typeof p.authenticate).toBe('function');
      expect(typeof p.refreshToken).toBe('function');
      expect(typeof p.generateAuthUrl).toBe('function');
      expect(typeof p.post).toBe('function');
      expect(typeof p.checkValidity).toBe('function');
    }
  });

  it('optional properties have correct types', () => {
    for (const p of socialIntegrationList) {
      if (p.isWeb3 !== undefined) expect(typeof p.isWeb3).toBe('boolean');
      if (p.isChromeExtension !== undefined) expect(typeof p.isChromeExtension).toBe('boolean');
      if (p.refreshCron !== undefined) expect(typeof p.refreshCron).toBe('boolean');
      if (p.oneTimeToken !== undefined) expect(typeof p.oneTimeToken).toBe('boolean');
      if (p.externalUrl) expect(typeof p.externalUrl).toBe('function');
      if (p.customFields) expect(typeof p.customFields).toBe('function');
    }
  });
});
