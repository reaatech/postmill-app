import '@gitroom/nestjs-libraries/ai-designer/agent-mesh/agent-mesh-env.shim';
import { Injectable, Logger } from '@nestjs/common';
import { dispatchToAgent } from '@reaatech/agent-mesh-router';
import type { AgentResponse } from '@reaatech/agent-mesh';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  CONTENT_PIPELINE_AGENTS,
  CONTENT_PIPELINE_AGENT_IDS,
} from './pipeline-registry.data';

export interface ContentBrief {
  brief: string;
  platforms?: string[];
  tone?: string;
}

export interface ContentPipelineResult {
  content: string[];
  perPlatform: Record<string, string>;
  critique?: { pass: boolean; fixes: string[] };
}

interface StrategistPlan {
  platforms: string[];
  angles?: string[];
  hooks?: string[];
  structure?: string;
}

interface PlatformLimit {
  id: string;
  maxLength: number;
}

@Injectable()
export class ContentPipelineConductorService {
  private readonly _logger = new Logger(
    ContentPipelineConductorService.name
  );

  // Per-(org, agent) circuit breaker. One tenant's broken AI provider must
  // never disable the pipeline for other orgs. Half-opens after RESET_MS.
  // Failure counts only accumulate within FAILURE_WINDOW_MS of the last
  // failure — stale entries are pruned on the next dispatch.
  private static readonly BREAKER_THRESHOLD = 5;
  private static readonly BREAKER_RESET_MS = 60_000;
  private static readonly BREAKER_FAILURE_WINDOW_MS = 10 * 60_000;
  private readonly _breakers = new Map<
    string,
    { failures: number; openedAt: number; lastFailureAt: number }
  >();

  // Resolve agent configs from this pipeline's OWN registry data, not the shared
  // process-global `registryState` (which the AI Designer mesh also swaps —
  // whichever module inits last wins, so a global lookup is non-deterministic).
  private static readonly _agentMap = new Map<
    string,
    (typeof CONTENT_PIPELINE_AGENTS)[number]
  >(CONTENT_PIPELINE_AGENTS.map((a) => [a.agent_id, a]));

  // Conservative fallback limits for the few providers that may not expose a
  // maxLength() method through the kernel bridge.
  private static readonly DEFAULT_MAX_LENGTHS: Record<string, number> = {
    x: 280,
    linkedin: 3000,
    'linkedin-page': 3000,
    instagram: 2200,
    'instagram-standalone': 2200,
    facebook: 63206,
    threads: 500,
    bluesky: 300,
    mastodon: 500,
    youtube: 5000,
    tiktok: 2200,
    reddit: 40000,
    telegram: 4096,
    discord: 2000,
    slack: 40000,
    pinterest: 500,
  };

  constructor(
    private readonly _budget: BudgetService,
    private readonly _integrations: IntegrationManager
  ) {}

  async generate(
    orgId: string,
    userId: string,
    brief: ContentBrief
  ): Promise<ContentPipelineResult> {
    const platforms =
      brief.platforms && brief.platforms.length > 0
        ? brief.platforms
        : ['x', 'linkedin'];

    const plan = await this._runStrategist(orgId, userId, {
      brief: brief.brief,
      platforms,
      tone: brief.tone,
    });

    const platformLimits = this._buildPlatformLimits(platforms);

    const perPlatform = await this._runCopywriter(orgId, userId, {
      plan,
      platformLimits,
      tone: brief.tone,
    });

    const critique = await this._runBrandCritic(orgId, userId, {
      perPlatform,
      platforms,
      tone: brief.tone,
    });

    // K=1 revision loop: if the critic fails, run the copywriter once more
    // with the fixes, then proceed to finalization.
    if (!critique.pass) {
      const revised = await this._runCopywriter(orgId, userId, {
        plan,
        platformLimits,
        tone: brief.tone,
        existingCopy: perPlatform,
        fixes: critique.fixes,
      });
      // Update the critique for the final result; the finalizer receives the
      // revised copy regardless of a second critique.
      Object.assign(perPlatform, revised);
    }

    const finalized = await this._runFinalizer(orgId, userId, {
      perPlatform,
      plan,
    });

    return {
      content: finalized.content,
      perPlatform: finalized.perPlatform,
      critique,
    };
  }

  private async _runStrategist(
    orgId: string,
    userId: string,
    payload: { brief: string; platforms: string[]; tone?: string }
  ): Promise<StrategistPlan> {
    const response = await this._dispatch(CONTENT_PIPELINE_AGENT_IDS.strategist, payload, {
      orgId,
      userId,
    });
    const parsed = this._safeJson(response.content) as
      | Partial<StrategistPlan>
      | undefined;
    return {
      platforms: parsed?.platforms ?? payload.platforms,
      angles: parsed?.angles ?? [],
      hooks: parsed?.hooks ?? [],
      structure: parsed?.structure ?? '',
    };
  }

  private async _runCopywriter(
    orgId: string,
    userId: string,
    payload: {
      plan: StrategistPlan;
      platformLimits: PlatformLimit[];
      tone?: string;
      existingCopy?: Record<string, string>;
      fixes?: string[];
    }
  ): Promise<Record<string, string>> {
    const response = await this._dispatch(CONTENT_PIPELINE_AGENT_IDS.copywriter, payload, {
      orgId,
      userId,
    });
    const parsed = this._safeJson(response.content) as
      | { perPlatform?: Record<string, string> }
      | undefined;
    return parsed?.perPlatform ?? {};
  }

  private async _runBrandCritic(
    orgId: string,
    userId: string,
    payload: {
      perPlatform: Record<string, string>;
      platforms: string[];
      tone?: string;
    }
  ): Promise<{ pass: boolean; fixes: string[] }> {
    const response = await this._dispatch(CONTENT_PIPELINE_AGENT_IDS.brandCritic, payload, {
      orgId,
      userId,
    });
    const parsed = this._safeJson(response.content) as
      | Partial<{ pass: boolean; fixes: unknown }>
      | undefined;
    return {
      pass: !!parsed?.pass,
      fixes: Array.isArray(parsed?.fixes) ? (parsed.fixes as string[]) : [],
    };
  }

  private async _runFinalizer(
    orgId: string,
    userId: string,
    payload: {
      perPlatform: Record<string, string>;
      plan: StrategistPlan;
    }
  ): Promise<{ content: string[]; perPlatform: Record<string, string> }> {
    const response = await this._dispatch(CONTENT_PIPELINE_AGENT_IDS.finalizer, payload, {
      orgId,
      userId,
    });
    const parsed = this._safeJson(response.content) as
      | Partial<{
          content: string[];
          perPlatform: Record<string, string>;
        }>
      | undefined;
    return {
      content: Array.isArray(parsed?.content) ? parsed.content : [],
      perPlatform:
        parsed?.perPlatform && typeof parsed.perPlatform === 'object'
          ? (parsed.perPlatform as Record<string, string>)
          : payload.perPlatform,
    };
  }

  private async _dispatch(
    agentId: string,
    payload: Record<string, unknown>,
    ctx: { orgId: string; userId: string }
  ): Promise<AgentResponse> {
    const breakerKey = `${ctx.orgId}:${agentId}`;
    const breaker = this._breakers.get(breakerKey);
    if (breaker) {
      if (
        Date.now() - breaker.lastFailureAt >
        ContentPipelineConductorService.BREAKER_FAILURE_WINDOW_MS
      ) {
        // Stale: no recent failure — prune so counts do not accumulate.
        this._breakers.delete(breakerKey);
      } else if (
        breaker.failures >=
          ContentPipelineConductorService.BREAKER_THRESHOLD &&
        Date.now() - breaker.openedAt <
          ContentPipelineConductorService.BREAKER_RESET_MS
      ) {
        throw new Error(`Circuit open for agent ${agentId}`);
      }
    }

    const budget = await this._budget.checkBudget('agent', ctx.orgId);
    if (!budget.allowed) {
      throw new Error(budget.reason || 'AI budget exceeded');
    }

    const agent = ContentPipelineConductorService._agentMap.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    const timeoutMs = this._agentTimeoutMs();
    let timer: NodeJS.Timeout | undefined;
    try {
      const response = await Promise.race([
        dispatchToAgent(agent, {
          sessionId: `content-pipeline:${ctx.orgId}:${Date.now()}`,
          employeeId: ctx.userId,
          displayName: 'Content Pipeline User',
          rawInput: JSON.stringify(payload),
          intentSummary: `dispatch to ${agentId}`,
          entities: {},
          detectedLanguage: 'en',
          turnHistory: [],
          workflowState: {},
          metadata: {
            orgId: ctx.orgId,
            userId: ctx.userId,
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Agent ${agentId} timed out after ${timeoutMs}ms`)
              ),
            timeoutMs
          );
        }),
      ]);
      this._breakers.delete(breakerKey);
      return response;
    } catch (err) {
      const prev = this._breakers.get(breakerKey);
      const withinWindow =
        prev &&
        Date.now() - prev.lastFailureAt <=
          ContentPipelineConductorService.BREAKER_FAILURE_WINDOW_MS;
      const failures = (withinWindow ? prev.failures : 0) + 1;
      this._breakers.set(breakerKey, {
        failures,
        lastFailureAt: Date.now(),
        openedAt:
          failures >= ContentPipelineConductorService.BREAKER_THRESHOLD
            ? Date.now()
            : 0,
      });
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private _buildPlatformLimits(platforms: string[]): PlatformLimit[] {
    return platforms.map((id) => {
      let maxLength: number | undefined;
      try {
        const provider = this._integrations.getSocialIntegrationUnchecked(id);
        if (provider && typeof provider.maxLength === 'function') {
          maxLength = provider.maxLength();
        }
      } catch {
        // Fall through to defaults.
      }
      return {
        id,
        maxLength:
          maxLength ??
          ContentPipelineConductorService.DEFAULT_MAX_LENGTHS[id] ??
          10_000,
      };
    });
  }

  private _agentTimeoutMs(): number {
    const raw = Number(process.env.CONTENT_PIPELINE_AGENT_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
  }

  private _safeJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
}
