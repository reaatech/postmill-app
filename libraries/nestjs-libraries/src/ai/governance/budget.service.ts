import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

export interface BudgetSettings {
  monthlyCap?: number;
  dailyCap?: number;
  perOrgCaps?: Record<string, { monthly?: number; daily?: number }>;
  scopeCaps?: Record<string, { monthly?: number; daily?: number }>;
  alertThresholdPct?: number;
}

@Injectable()
export class BudgetService {
  private readonly _logger = new Logger(BudgetService.name);
  private readonly DEFAULT_ALERT_THRESHOLD = 0.8;
  private readonly RESERVATION_BUFFER = 0.001;
  private readonly SUBSCRIPTION_CACHE_TTL = 10_000;
  private readonly SPEND_ACCUMULATOR_TTL = 60_000;
  private readonly MAX_ORG_MAP_SIZE = 10_000;
  private _subCache = new Map<string, { data: any; ts: number }>();

  // In-memory spend accumulator — tracks cumulative spend for the current month/day
  // to avoid re-querying the DB after each recordSpend call.
  private _spendAccum: {
    key: string;
    globalMonthly: number;
    globalDaily: number;
    orgMonthly: Map<string, number>;
    orgDaily: Map<string, number>;
    scopeMonthly: Map<string, number>;
    scopeDaily: Map<string, number>;
    ts: number;
  } | null = null;

  private _sequenceNumber = 0;

  private _thresholdFired = new Set<string>();

  private _getAccumKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}::${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }

  private async _ensureAccum(): Promise<void> {
    if (
      this._spendAccum &&
      this._spendAccum.key === this._getAccumKey() &&
      Date.now() - this._spendAccum.ts < this.SPEND_ACCUMULATOR_TTL
    ) {
      return;
    }

    this._thresholdFired.clear();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const totals = await this._batchTotals(startOfMonth, startOfDay);

    const orgMonthly = new Map<string, number>();
    const orgDaily = new Map<string, number>();
    const scopeMonthly = new Map<string, number>();
    const scopeDaily = new Map<string, number>();

    for (const [key, val] of Object.entries(totals.monthly)) {
      if (key !== '__global::__any') {
        const [orgId] = key.split('::');
        orgMonthly.set(orgId, (orgMonthly.get(orgId) ?? 0) + val);
        scopeMonthly.set(key, (scopeMonthly.get(key) ?? 0) + val);
      }
    }
    for (const [key, val] of Object.entries(totals.daily)) {
      if (key !== '__global::__any') {
        const [orgId] = key.split('::');
        orgDaily.set(orgId, (orgDaily.get(orgId) ?? 0) + val);
        scopeDaily.set(key, (scopeDaily.get(key) ?? 0) + val);
      }
    }

    this._spendAccum = {
      key: this._getAccumKey(),
      globalMonthly: totals.monthly['__global::__any'] ?? 0,
      globalDaily: totals.daily['__global::__any'] ?? 0,
      orgMonthly,
      orgDaily,
      scopeMonthly,
      scopeDaily,
      ts: Date.now(),
    };
  }

  constructor(
    private _aiSettingsManager: AiSettingsManager,
    private _aiSettings: AiSettingsService,
    private _subscriptionService: SubscriptionService,
    private _spendLogRepo: PrismaRepository<'aISpendLog'>,
    private _orgRepo: PrismaRepository<'organization'>,
    private _notificationService: NotificationService,
  ) {}

  clearSubCache() {
    this._subCache.clear();
  }

  private async _getCaps(): Promise<BudgetSettings> {
    const settings = await this._aiSettingsManager.getSettings();
    const caps: BudgetSettings | undefined = settings?.budgetSettings;
    return caps ?? {};
  }

  private async _batchTotals(
    startOfMonth: Date,
    startOfDay: Date,
  ): Promise<{ monthly: Record<string, number>; daily: Record<string, number> }> {
    const [monthlyRows, dailyRows] = await Promise.all([
      this._spendLogRepo.model.aISpendLog.groupBy({
        by: ['organizationId', 'scope'],
        where: { createdAt: { gte: startOfMonth } },
        _sum: { costUsd: true },
      }),
      this._spendLogRepo.model.aISpendLog.groupBy({
        by: ['organizationId', 'scope'],
        where: { createdAt: { gte: startOfDay } },
        _sum: { costUsd: true },
      }),
    ]);

    const monthly: Record<string, number> = {};
    for (const row of monthlyRows) {
      const key = `${row.organizationId ?? '__global'}::${row.scope ?? '__any'}`;
      monthly[key] = (monthly[key] ?? 0) + (row._sum?.costUsd ?? 0);
    }
    const globalMonthly = monthlyRows.reduce((s, r) => s + (r._sum?.costUsd ?? 0), 0);
    monthly['__global::__any'] = globalMonthly;

    const daily: Record<string, number> = {};
    for (const row of dailyRows) {
      const key = `${row.organizationId ?? '__global'}::${row.scope ?? '__any'}`;
      daily[key] = (daily[key] ?? 0) + (row._sum?.costUsd ?? 0);
    }
    const globalDaily = dailyRows.reduce((s, r) => s + (r._sum?.costUsd ?? 0), 0);
    daily['__global::__any'] = globalDaily;

    return { monthly, daily };
  }

  async checkBudget(
    scope: string,
    organizationId?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (scope === 'backfill') {
      return { allowed: true };
    }

    const caps = await this._getCaps();
    if (!caps.monthlyCap && !caps.dailyCap && !caps.perOrgCaps && !caps.scopeCaps) {
      return { allowed: true };
    }

    await this._ensureAccum();

    const globalMonthly = this._spendAccum!.globalMonthly;
    const globalDaily = this._spendAccum!.globalDaily;

    if (caps.monthlyCap && globalMonthly + this.RESERVATION_BUFFER > caps.monthlyCap) {
      return {
        allowed: false,
        reason: `Global monthly cap of $${caps.monthlyCap} exceeded ($${globalMonthly.toFixed(4)})`,
      };
    }

    if (caps.dailyCap && globalDaily + this.RESERVATION_BUFFER > caps.dailyCap) {
      return {
        allowed: false,
        reason: `Global daily cap of $${caps.dailyCap} exceeded ($${globalDaily.toFixed(4)})`,
      };
    }

    if (organizationId) {
      const orgCaps = caps.perOrgCaps?.[organizationId];
      const orgMonthly = this._spendAccum!.orgMonthly.get(organizationId) ?? 0;
      const orgDaily = this._spendAccum!.orgDaily.get(organizationId) ?? 0;

      if (orgCaps?.monthly && orgMonthly + this.RESERVATION_BUFFER > orgCaps.monthly) {
        return {
          allowed: false,
          reason: `Org monthly cap of $${orgCaps.monthly} exceeded ($${orgMonthly.toFixed(4)})`,
        };
      }
      if (orgCaps?.daily && orgDaily + this.RESERVATION_BUFFER > orgCaps.daily) {
        return {
          allowed: false,
          reason: `Org daily cap of $${orgCaps.daily} exceeded ($${orgDaily.toFixed(4)})`,
        };
      }
    }

    const scopeCaps = caps.scopeCaps?.[scope];
    if (scopeCaps) {
      const scopeKey = `${organizationId ?? '__global'}::${scope}`;
      const scopeMonthly = this._spendAccum!.scopeMonthly.get(scopeKey) ?? 0;
      const scopeDaily = this._spendAccum!.scopeDaily.get(scopeKey) ?? 0;

      if (scopeCaps.monthly && scopeMonthly + this.RESERVATION_BUFFER > scopeCaps.monthly) {
        return {
          allowed: false,
          reason: `Scope "${scope}" monthly cap of $${scopeCaps.monthly} exceeded`,
        };
      }
      if (scopeCaps.daily && scopeDaily + this.RESERVATION_BUFFER > scopeCaps.daily) {
        return {
          allowed: false,
          reason: `Scope "${scope}" daily cap of $${scopeCaps.daily} exceeded`,
        };
      }
    }

    return { allowed: true };
  }

  // @reaatech/agent-budget-pricing — token→cost normalization. Lazy + guarded so an
  // unavailable package never blocks spend recording (falls back to the caller's costUsd).
  private _pricingEngine: any | null | false = null;

  private async _getPricingEngine(): Promise<any | null> {
    if (this._pricingEngine !== null) return this._pricingEngine || null;
    try {
      const { PricingEngine } = await import('@reaatech/agent-budget-pricing');
      this._pricingEngine = new PricingEngine();
    } catch (err) {
      this._logger.warn(`agent-budget-pricing unavailable: ${(err as Error).message}`);
      this._pricingEngine = false;
    }
    return this._pricingEngine || null;
  }

  // Authoritative cost = caller-supplied costUsd when present; otherwise derive it from
  // tokens via the pricing engine (§6.1). Returns the input unchanged on any failure.
  private async _resolveCost(data: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): Promise<number> {
    if (data.costUsd && data.costUsd > 0) return data.costUsd;
    const engine = await this._getPricingEngine();
    if (!engine) return data.costUsd;
    try {
      const computed = engine.computeCost(
        data.inputTokens ?? 0,
        data.outputTokens ?? 0,
        data.model,
        data.provider,
      );
      return typeof computed === 'number' && computed >= 0 ? computed : data.costUsd;
    } catch (err) {
      this._logger.warn(`Pricing computeCost failed for ${data.provider}/${data.model}: ${(err as Error).message}`);
      return data.costUsd;
    }
  }

  async recordSpend(data: {
    organizationId?: string;
    userId?: string;
    provider: string;
    model: string;
    scope: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): Promise<void> {
    data = { ...data, costUsd: await this._resolveCost(data) };
    await this._aiSettings.createSpendLog(data);

    await this._ensureAccum();

    const seq = this._sequenceNumber++;
    try {
      this._spendAccum!.globalMonthly += data.costUsd;
      this._spendAccum!.globalDaily += data.costUsd;

      if (data.organizationId) {
        if (
          this._spendAccum!.orgMonthly.size >= this.MAX_ORG_MAP_SIZE &&
          !this._spendAccum!.orgMonthly.has(data.organizationId)
        ) {
          this._logger.warn(
            `BudgetService: org map size (${this.MAX_ORG_MAP_SIZE}) exceeded, skipping tracking for org ${data.organizationId}`,
          );
        } else {
          this._spendAccum!.orgMonthly.set(
            data.organizationId,
            (this._spendAccum!.orgMonthly.get(data.organizationId) ?? 0) + data.costUsd,
          );
          this._spendAccum!.orgDaily.set(
            data.organizationId,
            (this._spendAccum!.orgDaily.get(data.organizationId) ?? 0) + data.costUsd,
          );
        }
      }

      const scopeKey = `${data.organizationId ?? '__global'}::${data.scope}`;
      if (
        this._spendAccum!.scopeMonthly.size >= this.MAX_ORG_MAP_SIZE &&
        !this._spendAccum!.scopeMonthly.has(scopeKey)
      ) {
        this._logger.warn(
          `BudgetService: scope map size (${this.MAX_ORG_MAP_SIZE}) exceeded, skipping tracking for scope ${scopeKey}`,
        );
      } else {
        this._spendAccum!.scopeMonthly.set(
          scopeKey,
          (this._spendAccum!.scopeMonthly.get(scopeKey) ?? 0) + data.costUsd,
        );
        this._spendAccum!.scopeDaily.set(
          scopeKey,
          (this._spendAccum!.scopeDaily.get(scopeKey) ?? 0) + data.costUsd,
        );
      }
    } finally {
      if (seq !== this._sequenceNumber - 1) {
        this._logger.warn('Concurrent modification detected on _spendAccum');
      }
    }

    const caps = await this._getCaps();
    const threshold = caps.alertThresholdPct ?? this.DEFAULT_ALERT_THRESHOLD;

    const thresholdPct = this._spendAccum!.globalMonthly / (caps.monthlyCap || 1);

    if (caps.monthlyCap && this._spendAccum!.globalMonthly >= caps.monthlyCap * threshold) {
      const alertKey = `global:monthly:${this._getAccumKey()}`;
      if (!this._thresholdFired.has(alertKey)) {
        this._thresholdFired.add(alertKey);
        this._logger.warn(
          `Budget alert: ${((this._spendAccum!.globalMonthly / caps.monthlyCap) * 100).toFixed(0)}% of global monthly cap ($${caps.monthlyCap}) used`,
        );
        if (data.organizationId) {
          try {
            await this._notificationService.notifyBudgetThreshold(data.organizationId, data.scope, thresholdPct * 100);
          } catch {}
        }
      }
    }

    if (data.organizationId) {
      const orgCaps = caps.perOrgCaps?.[data.organizationId];
      const orgMonthly = this._spendAccum!.orgMonthly.get(data.organizationId) ?? 0;
      if (orgCaps?.monthly && orgMonthly >= orgCaps.monthly * threshold) {
        const alertKey = `${data.organizationId}:monthly:${this._getAccumKey()}`;
        if (!this._thresholdFired.has(alertKey)) {
          this._thresholdFired.add(alertKey);
          this._logger.warn(
            `Budget alert: Org ${data.organizationId} at ${((orgMonthly / orgCaps.monthly) * 100).toFixed(0)}% of monthly cap`,
          );
          try {
            await this._notificationService.notifyBudgetThreshold(data.organizationId, data.scope, (orgMonthly / orgCaps.monthly) * 100);
          } catch {}
        }
      }
    }

    if (caps.dailyCap && this._spendAccum!.globalDaily >= caps.dailyCap) {
      const alertKey = `global:daily:${this._getAccumKey()}`;
      if (!this._thresholdFired.has(alertKey)) {
        this._thresholdFired.add(alertKey);
        this._logger.warn(
          `Daily cap of $${caps.dailyCap} exceeded ($${this._spendAccum!.globalDaily.toFixed(4)})`,
        );
        if (data.organizationId) {
          try {
            await this._notificationService.notifyBudgetThreshold(data.organizationId, 'daily_cap', 100);
          } catch {}
        }
      }
    }

    if (data.organizationId) {
      const orgCaps = caps.perOrgCaps?.[data.organizationId];
      const orgDaily = this._spendAccum!.orgDaily.get(data.organizationId) ?? 0;
      if (orgCaps?.daily && orgDaily >= orgCaps.daily) {
        const alertKey = `${data.organizationId}:daily:${this._getAccumKey()}`;
        if (!this._thresholdFired.has(alertKey)) {
          this._thresholdFired.add(alertKey);
          this._logger.warn(
            `Daily cap of $${orgCaps.daily} exceeded for org ${data.organizationId} ($${orgDaily.toFixed(4)})`,
          );
          try {
            await this._notificationService.notifyBudgetThreshold(data.organizationId, 'daily_cap', 100);
          } catch {}
        }
      }
    }
  }

  async checkMediaCredits(
    organizationId: string,
    creditType: 'ai_images' | 'ai_videos',
  ): Promise<{ allowed: boolean; remaining: number }> {
    const cached = this._subCache.get(organizationId);
    if (!cached || Date.now() - cached.ts > this.SUBSCRIPTION_CACHE_TTL) {
      this._subCache.set(organizationId, {
        data: await this._orgRepo.model.organization.findUnique({
          where: { id: organizationId },
          include: { subscription: true },
        }),
        ts: Date.now(),
      });
    }

    const org = this._subCache.get(organizationId)?.data;

    if (!org) {
      return { allowed: false, remaining: 0 };
    }

    const { credits } = await this._subscriptionService.checkCredits(org as any, creditType);

    if (credits <= 0) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: credits };
  }
}
