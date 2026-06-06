import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGroupBy = vi.fn().mockResolvedValue([]);
const mockCreateSpendLog = vi.fn().mockResolvedValue(undefined);
const mockFindUnique = vi.fn().mockResolvedValue(null);
const mockCheckCredits = vi.fn().mockResolvedValue({ credits: 100, remaining: 100 });

const mockGetSettings = vi.fn().mockResolvedValue(null);

vi.mock('@gitroom/nestjs-libraries/ai/ai-settings.manager', () => ({
  AiSettingsManager: class MockManager {
    getSettings = mockGetSettings;
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service', () => ({
  AiSettingsService: class MockAiSettings {
    createSpendLog = mockCreateSpendLog;
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({
  SubscriptionService: class MockSub {
    checkCredits = mockCheckCredits;
  },
}));

const mockComputeCost = vi.fn().mockReturnValue(0.123);
vi.mock('@reaatech/agent-budget-pricing', () => ({
  PricingEngine: class MockPricing {
    computeCost = mockComputeCost;
  },
}));

import { BudgetService } from './budget.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';

const mockSpendLogRepo = { model: { aISpendLog: { groupBy: mockGroupBy } } };
const mockOrgRepo = { model: { organization: { findUnique: mockFindUnique } } };

describe('BudgetService', () => {
  let service: BudgetService;

  function freshService() {
    return new BudgetService(
      new (AiSettingsManager as any)(),
      new (AiSettingsService as any)(),
      new (SubscriptionService as any)(),
      mockSpendLogRepo as any,
      mockOrgRepo as any,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupBy.mockResolvedValue([]);
    mockGetSettings.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockCheckCredits.mockResolvedValue({ credits: 100, remaining: 100 });
    service = freshService();
  });

  describe('checkBudget', () => {
    it('returns allowed:true when no caps are configured', async () => {
      mockGetSettings.mockResolvedValue({
        activeProvider: 'openai',
        activeModel: 'gpt-4.1',
      });
      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('returns allowed:true when budgetSettings is empty', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {},
      });
      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('returns allowed:true when spend is under the global monthly cap', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: { monthlyCap: 100 },
      });
      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('blocks when global monthly cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: { monthlyCap: 100 },
      });
      mockGroupBy
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 150 } },
        ])
        .mockResolvedValueOnce([]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Global monthly cap');
    });

    it('blocks when global daily cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: { dailyCap: 10 },
      });
      mockGroupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 50 } },
        ]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Global daily cap');
    });

    it('blocks when per-org monthly cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {
          perOrgCaps: { 'org-1': { monthly: 50 } },
        },
      });
      mockGroupBy
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 80 } },
        ])
        .mockResolvedValueOnce([]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Org monthly cap');
    });

    it('blocks when per-org daily cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {
          perOrgCaps: { 'org-1': { daily: 5 } },
        },
      });
      mockGroupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 20 } },
        ]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Org daily cap');
    });

    it('blocks when per-scope monthly cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {
          scopeCaps: { utility: { monthly: 30 } },
        },
      });
      mockGroupBy
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 50 } },
        ])
        .mockResolvedValueOnce([]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Scope "utility" monthly cap');
    });

    it('blocks when per-scope daily cap is exceeded', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {
          scopeCaps: { utility: { daily: 5 } },
        },
      });
      mockGroupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { organizationId: 'org-1', scope: 'utility', _sum: { costUsd: 10 } },
        ]);

      service = freshService();
      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Scope "utility" daily cap');
    });

    it('allows when no organizationId is provided and only per-org caps exist', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: {
          perOrgCaps: { 'org-1': { monthly: 1 } },
        },
      });
      service = freshService();
      const result = await service.checkBudget('utility');
      expect(result.allowed).toBe(true);
    });
  });

  describe('recordSpend', () => {
    it('persists spend log via AiSettingsService', async () => {
      await service.recordSpend({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 100,
        outputTokens: 200,
        costUsd: 0.05,
      });
      expect(mockCreateSpendLog).toHaveBeenCalledTimes(1);
      expect(mockCreateSpendLog).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          provider: 'openai',
          model: 'gpt-4.1',
          scope: 'utility',
          costUsd: 0.05,
        }),
      );
    });

    it('updates the in-memory accumulators', async () => {
      mockGetSettings.mockResolvedValue({
        budgetSettings: { monthlyCap: 100 },
      });
      service = freshService();

      await service.recordSpend({
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 50,
        outputTokens: 50,
        costUsd: 0.01,
      });
      await service.recordSpend({
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 50,
        outputTokens: 50,
        costUsd: 0.02,
      });

      const result = await service.checkBudget('utility', 'org-1');
      expect(result.allowed).toBe(true);
    });

    it('records spend without organizationId', async () => {
      await service.recordSpend({
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0.001,
      });
      expect(mockCreateSpendLog).toHaveBeenCalledTimes(1);
      const callArg = mockCreateSpendLog.mock.calls[0][0];
      expect(callArg.provider).toBe('openai');
      expect(callArg.model).toBe('gpt-4.1');
      expect(callArg.scope).toBe('utility');
      expect(callArg.organizationId).toBeUndefined();
    });

    it('derives cost from the pricing engine when costUsd is 0 (§6.1)', async () => {
      await service.recordSpend({
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0,
      });
      expect(mockComputeCost).toHaveBeenCalledWith(1000, 500, 'gpt-4.1', 'openai');
      expect(mockCreateSpendLog).toHaveBeenCalledWith(
        expect.objectContaining({ costUsd: 0.123 }),
      );
    });

    it('prefers the caller-supplied cost over the pricing engine', async () => {
      await service.recordSpend({
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-4.1',
        scope: 'utility',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.07,
      });
      expect(mockComputeCost).not.toHaveBeenCalled();
      expect(mockCreateSpendLog).toHaveBeenCalledWith(
        expect.objectContaining({ costUsd: 0.07 }),
      );
    });

    it('can be called multiple times in succession', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordSpend({
          organizationId: 'org-1',
          provider: 'openai',
          model: `gpt-4.1`,
          scope: 'utility',
          inputTokens: 10,
          outputTokens: 10,
          costUsd: 0.01,
        });
      }
      expect(mockCreateSpendLog).toHaveBeenCalledTimes(5);
    });
  });

  describe('checkMediaCredits', () => {
    it('returns allowed:false with remaining:0 when org not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      service = freshService();
      const result = await service.checkMediaCredits('nonexistent-org', 'ai_images');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('returns allowed:true with positive remaining when credits exist', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'org-1',
        subscription: { credits: 100 },
      });
      mockCheckCredits.mockResolvedValue({ credits: 50, remaining: 50 });

      service = freshService();
      const result = await service.checkMediaCredits('org-1', 'ai_images');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
      expect(mockCheckCredits).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'org-1' }),
        'ai_images',
      );
    });

    it('returns allowed:false with remaining:0 when credits are zero', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'org-1',
        subscription: { credits: 0 },
      });
      mockCheckCredits.mockResolvedValue({ credits: 0, remaining: 0 });

      service = freshService();
      const result = await service.checkMediaCredits('org-1', 'ai_videos');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('caches the org lookup within TTL', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'org-1',
        subscription: { credits: 100 },
      });
      mockCheckCredits.mockResolvedValue({ credits: 50, remaining: 50 });

      service = freshService();
      await service.checkMediaCredits('org-1', 'ai_images');
      await service.checkMediaCredits('org-1', 'ai_images');

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCheckCredits).toHaveBeenCalledTimes(2);
    });

    it('caches org lookups independently per organization', async () => {
      mockFindUnique
        .mockResolvedValueOnce({ id: 'org-1', subscription: { credits: 100 } })
        .mockResolvedValueOnce({ id: 'org-2', subscription: { credits: 100 } });
      mockCheckCredits.mockResolvedValue({ credits: 50, remaining: 50 });

      service = freshService();
      await service.checkMediaCredits('org-1', 'ai_images');
      await service.checkMediaCredits('org-2', 'ai_images');
      await service.checkMediaCredits('org-1', 'ai_images');

      expect(mockFindUnique).toHaveBeenCalledTimes(2);
      expect(mockFindUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: { id: 'org-1' },
      }));
      expect(mockFindUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: { id: 'org-2' },
      }));
      expect(mockCheckCredits).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'org-2' }),
        'ai_images',
      );
    });

    it('supports ai_videos credit type', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'org-1',
        subscription: { credits: 100 },
      });
      mockCheckCredits.mockResolvedValue({ credits: 10, remaining: 10 });

      service = freshService();
      const result = await service.checkMediaCredits('org-1', 'ai_videos');
      expect(mockCheckCredits).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'org-1' }),
        'ai_videos',
      );
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });
  });

  describe('clearSubCache', () => {
    it('clears the subscription cache', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'org-1',
        subscription: { credits: 100 },
      });
      mockCheckCredits.mockResolvedValue({ credits: 50, remaining: 50 });

      service = freshService();
      await service.checkMediaCredits('org-1', 'ai_images');
      expect(mockFindUnique).toHaveBeenCalledTimes(1);

      service.clearSubCache();
      await service.checkMediaCredits('org-1', 'ai_images');
      expect(mockFindUnique).toHaveBeenCalledTimes(2);
    });
  });
});
