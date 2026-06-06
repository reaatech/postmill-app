import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

const mockAdapter = {
  identifier: 'openai',
  name: 'OpenAI',
  type: 'direct',
  credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
  capabilities: { text: true, image: true, vision: true, embeddings: true, speech: true, tools: true },
  privacy: { dataRetention: '30 days', trainingOnData: false, description: '' },
  listModels: vi.fn().mockResolvedValue([
    { id: 'gpt-4.1', label: 'GPT-4.1', kind: 'text', capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: true } },
  ]),
  validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
  createLanguageModel: vi.fn(() => ({ doGenerate: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'test' }], usage: { inputTokens: 10, outputTokens: 20 } }) })),
};

vi.mock('@gitroom/nestjs-libraries/ai/ai-provider.registry', () => ({
  AIProviderRegistry: class {
    getAdapter = vi.fn().mockReturnValue(mockAdapter);
    list = vi.fn().mockReturnValue([mockAdapter]);
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service', () => ({
  AiSettingsService: class {
    getProviderConfigs = vi.fn().mockResolvedValue([]);
    getProviderConfigByIdentifier = vi.fn().mockResolvedValue(null);
    upsertProviderConfig = vi.fn().mockImplementation((id: string, data: any) => ({ identifier: id, ...data, enabled: true, updatedAt: new Date() }));
    upsertSystemSettings = vi.fn().mockResolvedValue({});
    getSystemSettings = vi.fn().mockResolvedValue(null);
    getDecryptedSystemSettings = vi.fn().mockResolvedValue(null);
    createAuditLog = vi.fn().mockResolvedValue({});
    createSpendLog = vi.fn().mockResolvedValue({});
    getSpendLogs = vi.fn().mockResolvedValue([]);
    getSpendSummary = vi.fn().mockResolvedValue([]);
    getAuditLogs = vi.fn().mockResolvedValue([]);
    decryptProviderConfig = vi.fn().mockReturnValue({ credentials: { apiKey: 'sk-test' } });
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/ai-settings.manager', () => ({
  AiSettingsManager: class {
    getSettings = vi.fn().mockResolvedValue({ activeProvider: null, activeModel: null });
    refreshCache = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/provider-health.service', () => ({
  ProviderHealthService: class {
    getAllHealth = vi.fn().mockReturnValue({});
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/guardrail.service', () => ({
  GuardrailService: class {
    checkInput = vi.fn().mockImplementation(async (text: string) => text);
    checkOutput = vi.fn().mockImplementation(async (text: string) => text);
  },
}));

const mockBudgetService = {
  checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
};
vi.mock('@gitroom/nestjs-libraries/ai/governance/budget.service', () => ({
  BudgetService: class {
    checkBudget = mockBudgetService.checkBudget;
  },
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/rag.service', () => ({
  RagService: class {
    backfill = vi.fn().mockResolvedValue({ indexed: 0 });
  },
}));

import { AiSettingsController } from './ai-settings.controller';
import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { ProviderHealthService } from '@gitroom/nestjs-libraries/ai/governance/provider-health.service';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { RagService } from '@gitroom/nestjs-libraries/ai/governance/rag.service';

const superAdmin = { id: 'admin-1', isSuperAdmin: true } as any;
const regularUser = { id: 'user-1', isSuperAdmin: false } as any;

describe('AiSettingsController', () => {
  let controller: AiSettingsController;
  let registry: AIProviderRegistry;
  let aiSettings: AiSettingsService;
  let settingsManager: AiSettingsManager;
  let health: ProviderHealthService;
  let guardrails: GuardrailService;
  let budget: BudgetService;
  let rag: RagService;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new (AIProviderRegistry as any)();
    aiSettings = new (AiSettingsService as any)();
    settingsManager = new (AiSettingsManager as any)();
    health = new (ProviderHealthService as any)();
    guardrails = new (GuardrailService as any)();
    budget = new (BudgetService as any)();
    rag = new (RagService as any)();

    controller = new AiSettingsController(
      aiSettings as any,
      settingsManager as any,
      registry as any,
      health as any,
      guardrails as any,
      budget as any,
      rag as any,
    );
  });

  describe('assertSuperAdmin', () => {
    it('allows super-admin users', () => {
      expect(() => (controller as any).assertSuperAdmin(superAdmin)).not.toThrow();
    });

    it('throws ForbiddenException for non-super-admin users', () => {
      expect(() => (controller as any).assertSuperAdmin(regularUser)).toThrow(ForbiddenException);
    });
  });

  describe('listProviders', () => {
    it('returns a list of providers with metadata', async () => {
      const result = await controller.listProviders(superAdmin);
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('identifier');
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('capabilities');
        expect(result[0]).toHaveProperty('isConfigured');
      }
    });

    it('rejects non-admin users', async () => {
      await expect(controller.listProviders(regularUser)).rejects.toThrow(ForbiddenException);
    });

    it('marks providers configured when all required credential fields are present, not only apiKey', async () => {
      const regionAdapter = {
        ...mockAdapter,
        identifier: 'bedrock',
        credentialFields: [
          { key: 'accessKeyId', label: 'Access Key ID', type: 'password', required: true },
          { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true },
          { key: 'region', label: 'Region', type: 'string', required: true },
        ],
      };
      (registry as any).list.mockReturnValue([regionAdapter]);
      (aiSettings as any).getProviderConfigs.mockResolvedValue([
        { identifier: 'bedrock', enabled: true, credentials: 'encrypted' },
      ]);
      (aiSettings as any).decryptProviderConfig.mockReturnValue({
        credentials: {
          accessKeyId: 'AKIA...',
          secretAccessKey: 'secret',
          region: 'us-east-1',
        },
      });

      const result = await controller.listProviders(superAdmin);

      expect(result[0].isConfigured).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('returns provider details with model list', async () => {
      const result = await controller.getProvider(superAdmin, 'openai');
      expect(result).toHaveProperty('models');
      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe('gpt-4.1');
    });

    it('redacts sensitive nested extraConfig fields', async () => {
      (aiSettings as any).getProviderConfigByIdentifier.mockResolvedValue({
        identifier: 'openai',
        enabled: true,
        credentials: 'encrypted',
        defaultModel: 'gpt-4.1',
        imageModel: null,
        extraConfig: JSON.stringify({
          baseURL: 'https://api.example.test/v1',
          apiKey: 'sk-leak',
          nested: { accessToken: 'tok-leak', region: 'us-east-1' },
        }),
      });

      const result = await controller.getProvider(superAdmin, 'openai');

      expect(result.extraConfig).toEqual({
        baseURL: 'https://api.example.test/v1',
        apiKey: '[REDACTED]',
        nested: { accessToken: '[REDACTED]', region: 'us-east-1' },
      });
    });

    it('throws BadRequestException for unknown provider', async () => {
      const getAdapter = (registry as any).getAdapter as any;
      getAdapter.mockReturnValue(undefined);
      await expect(controller.getProvider(superAdmin, 'nonexistent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveProvider', () => {
    it('saves provider config and writes audit log', async () => {
      const result = await controller.saveProvider(superAdmin, 'openai', {
        enabled: true,
        credentials: { apiKey: 'sk-new' },
        defaultModel: 'gpt-4.1',
      });
      expect(result.identifier).toBe('openai');
      expect(aiSettings.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('testProvider', () => {
    it('calls validateCredentials on the adapter', async () => {
      const result = await controller.testProvider(superAdmin, 'openai', { credentials: { apiKey: 'sk-test' } });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('setActive', () => {
    it('sets the active provider and model', async () => {
      (aiSettings as any).getProviderConfigByIdentifier.mockResolvedValue({
        identifier: 'openai',
        enabled: true,
        credentials: 'encrypted',
      });

      const result = await controller.setActive(superAdmin, { provider: 'openai', model: 'gpt-4.1' });
      expect(result.activeProvider).toBe('openai');
      expect(result.activeModel).toBe('gpt-4.1');
    });

    it('clears active provider to restore env fallback mode', async () => {
      const result = await controller.setActive(superAdmin, { provider: null, model: null });

      expect(aiSettings.upsertSystemSettings).toHaveBeenCalledWith({
        activeProvider: null,
        activeModel: null,
      });
      expect(result).toEqual({ activeProvider: null, activeModel: null });
    });

    it('rejects activating a provider without enabled stored credentials', async () => {
      (aiSettings as any).getProviderConfigByIdentifier.mockResolvedValue({
        identifier: 'openai',
        enabled: false,
        credentials: null,
      });

      await expect(
        controller.setActive(superAdmin, { provider: 'openai', model: 'gpt-4.1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHealth', () => {
    it('returns health status', async () => {
      const result = await controller.getHealth(superAdmin);
      expect(result).toHaveProperty('hasActiveConfig');
      expect(result).toHaveProperty('envFallback');
    });
  });

  describe('triggerRagBackfill', () => {
    it('triggers backfill and records spend log', async () => {
      const result = await controller.triggerRagBackfill(superAdmin, { organizationId: 'org-1' });
      expect(result.status).toBe('completed');
      expect((result as { indexed: number }).indexed).toBe(0);
      expect(aiSettings.createSpendLog).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'backfill' }),
      );
    });
  });

  describe('listOrgProviderConfigs', () => {
    it('redacts sensitive extraConfig values for org provider configs', async () => {
      (aiSettings as any).getOrgProviderConfigs = vi.fn().mockResolvedValue([
        {
          id: 'cfg-1',
          organizationId: 'org-1',
          identifier: 'openai',
          enabled: true,
          defaultModel: 'gpt-4.1',
          imageModel: null,
          extraConfig: JSON.stringify({ webhookSecret: 'secret', label: 'prod' }),
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);

      const result = await controller.listOrgProviderConfigs(superAdmin, 'org-1');

      expect(result[0].extraConfig).toEqual({
        webhookSecret: '[REDACTED]',
        label: 'prod',
      });
    });
  });
});
