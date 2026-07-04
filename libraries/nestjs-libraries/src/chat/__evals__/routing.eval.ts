import { describe, it, expect, vi } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: { _type: 'mock.mastra.store' },
}));

import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { ToolFirewallService } from '@gitroom/nestjs-libraries/ai/governance/tool-firewall.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { ModuleRef } from '@nestjs/core';
import { ContentAgentBuilder } from '@gitroom/nestjs-libraries/chat/agents/content.agent';
import { MediaAgentBuilder } from '@gitroom/nestjs-libraries/chat/agents/media.agent';
import { AnalyticsAgentBuilder } from '@gitroom/nestjs-libraries/chat/agents/analytics.agent';
import { OpsAgentBuilder } from '@gitroom/nestjs-libraries/chat/agents/ops.agent';
import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';

const liveEval = process.env.LIVE_EVAL === '1';

const mockIntegrationManager = {
  getAllowedSocialsIntegrations: () => [
    'x',
    'linkedin',
    'facebook',
    'instagram',
    'bluesky',
    'threads',
    'tiktok',
    'youtube',
    'pinterest',
    'reddit',
    'discord',
    'telegram',
    'slack',
    'wordpress',
    'devto',
    'hashnode',
    'medium',
  ],
  getSocialIntegrationUnchecked: () => ({}),
};

const instantiateTool = (ToolClass: any): any => {
  if (ToolClass === IntegrationValidationTool) {
    return new ToolClass(mockIntegrationManager);
  }
  if (ToolClass === IntegrationTriggerTool) {
    return new ToolClass(mockIntegrationManager, {}, {});
  }
  return Reflect.construct(ToolClass, new Array(ToolClass.length).fill(undefined));
};

/**
 * Build the flat tools map without spinning up the full Nest container.
 * Tool constructors only assign services to private fields, so passing undefined
 * for every dependency is safe for the description-only deterministic checks.
 */
const buildFlatTools = async (): Promise<Record<string, any>> => {
  const firewall = new ToolFirewallService();
  const entries = await Promise.all(
    toolList.map(async (ToolClass: any) => {
      const instance = instantiateTool(ToolClass);
      const tool = await instance.run();
      return { name: instance.name as string, tool: firewall.wrap(instance.name, tool) };
    })
  );
  return entries.reduce(
    (acc, { name, tool }) => ({ ...acc, [name]: tool }),
    {} as Record<string, any>
  );
};

const buildLoadToolsService = async () => {
  const aiModelProvider = {
    languageModel: (scope: string, orgId?: string) => ({
      id: `fake-${scope}-model`,
      scope,
      orgId,
    }),
  } as any;

  const brandsService = {
    getDefaultBrand: async () => null,
  } as any;

  const moduleRef = {
    get: (type: any) => {
      if (toolList.includes(type)) {
        return instantiateTool(type);
      }
      return undefined;
    },
  } as unknown as ModuleRef;

  const toolFirewall = new ToolFirewallService();

  return new LoadToolsService(
    moduleRef,
    aiModelProvider,
    toolFirewall,
    brandsService,
    new ContentAgentBuilder(aiModelProvider),
    new MediaAgentBuilder(aiModelProvider),
    new AnalyticsAgentBuilder(aiModelProvider),
    new OpsAgentBuilder(aiModelProvider)
  );
};

type Specialist = 'supervisor' | 'content' | 'media' | 'analytics' | 'ops';

interface RoutingCase {
  prompt: string;
  expectedToolId: string;
  expectedSpecialist: Specialist;
  keywords: string[];
}

const ROUTING_CASES: RoutingCase[] = [
  // Supervisor direct tools
  {
    prompt: 'List my channels',
    expectedToolId: 'integrationList',
    expectedSpecialist: 'supervisor',
    keywords: ['integrations', 'schedule'],
  },
  {
    prompt: 'List my customer groups',
    expectedToolId: 'groupList',
    expectedSpecialist: 'supervisor',
    keywords: ['groups', 'customers'],
  },

  // Analytics
  {
    prompt: 'How are my channels doing this month?',
    expectedToolId: 'analyticsOverview',
    expectedSpecialist: 'analytics',
    keywords: ['analytics', 'overview', 'channels'],
  },
  {
    prompt: 'What are my stats for the last 30 days?',
    expectedToolId: 'analyticsOverview',
    expectedSpecialist: 'analytics',
    keywords: ['analytics', 'overview'],
  },
  {
    prompt: 'When is the best time to post on LinkedIn?',
    expectedToolId: 'bestTime',
    expectedSpecialist: 'analytics',
    keywords: ['best', 'time', 'post'],
  },
  {
    prompt: 'Give me recommendations to improve engagement',
    expectedToolId: 'recommendations',
    expectedSpecialist: 'analytics',
    keywords: ['recommendations'],
  },
  {
    prompt: 'How did my post abc-123 perform?',
    expectedToolId: 'analyticsPost',
    expectedSpecialist: 'analytics',
    keywords: ['post', 'analytics'],
  },
  {
    prompt: 'How am I doing versus @competitor?',
    expectedToolId: 'watchlist',
    expectedSpecialist: 'analytics',
    keywords: ['competitors'],
  },

  // Media
  {
    prompt: 'Generate an image of a sunset',
    expectedToolId: 'generateImageTool',
    expectedSpecialist: 'media',
    keywords: ['generate', 'image'],
  },
  {
    prompt: 'Make a video for my product launch',
    expectedToolId: 'generateVideoTool',
    expectedSpecialist: 'media',
    keywords: ['generate', 'video'],
  },
  {
    prompt: 'List my media providers',
    expectedToolId: 'listMediaProviders',
    expectedSpecialist: 'media',
    keywords: ['media', 'providers'],
  },
  {
    prompt: 'What models does Runway offer?',
    expectedToolId: 'listMediaModels',
    expectedSpecialist: 'media',
    keywords: ['media', 'models'],
  },
  {
    prompt: 'Create a video with Runway',
    expectedToolId: 'mediaStudioGenerate',
    expectedSpecialist: 'media',
    keywords: ['media', 'generate', 'provider'],
  },
  {
    prompt: 'Is my media job done?',
    expectedToolId: 'mediaJobStatus',
    expectedSpecialist: 'media',
    keywords: ['job', 'status'],
  },
  {
    prompt: 'Find my logo in the file library',
    expectedToolId: 'filesSearch',
    expectedSpecialist: 'media',
    keywords: ['files', 'search'],
  },
  {
    prompt: 'Search free stock photos of cats',
    expectedToolId: 'stockSearch',
    expectedSpecialist: 'media',
    keywords: ['stock', 'media'],
  },
  {
    prompt: 'Open this image in the Designer',
    expectedToolId: 'designerDesign',
    expectedSpecialist: 'media',
    keywords: ['designer'],
  },
  {
    prompt: 'Upload this image from a URL',
    expectedToolId: 'uploadFromUrlTool',
    expectedSpecialist: 'media',
    keywords: ['upload', 'url'],
  },

  // Content
  {
    prompt: 'Write a caption about our sale',
    expectedToolId: 'generatePostContent',
    expectedSpecialist: 'content',
    keywords: ['generate', 'post', 'content'],
  },
  {
    prompt: 'Run the generator for a thread about AI',
    expectedToolId: 'runGenerator',
    expectedSpecialist: 'content',
    keywords: ['generator', 'research'],
  },
  {
    prompt: 'Search brand memory for launch posts',
    expectedToolId: 'brandMemorySearch',
    expectedSpecialist: 'content',
    keywords: ['brand', 'memory'],
  },
  {
    prompt: 'What is my brand voice?',
    expectedToolId: 'brandProfile',
    expectedSpecialist: 'content',
    keywords: ['brand', 'profile'],
  },
  {
    prompt: 'Reindex my brand memory',
    expectedToolId: 'brandMemoryReindex',
    expectedSpecialist: 'content',
    keywords: ['brand', 'memory', 'index'],
  },
  {
    prompt: 'Search RAG for past campaigns',
    expectedToolId: 'ragSearch',
    expectedSpecialist: 'content',
    keywords: ['rag', 'search'],
  },

  // Ops
  {
    prompt: 'Schedule a post to LinkedIn tomorrow',
    expectedToolId: 'schedulePostTool',
    expectedSpecialist: 'ops',
    keywords: ['schedule', 'post'],
  },
  {
    prompt: 'What posts are scheduled this week?',
    expectedToolId: 'listPosts',
    expectedSpecialist: 'ops',
    keywords: ['list', 'posts'],
  },
  {
    prompt: 'Get post details for abc-123',
    expectedToolId: 'getPost',
    expectedSpecialist: 'ops',
    keywords: ['get', 'post'],
  },
  {
    prompt: 'Move my Friday post to Monday',
    expectedToolId: 'reschedulePost',
    expectedSpecialist: 'ops',
    keywords: ['reschedule', 'post'],
  },
  {
    prompt: 'Delete post group xyz',
    expectedToolId: 'deletePost',
    expectedSpecialist: 'ops',
    keywords: ['delete', 'post'],
  },
  {
    prompt: 'Approve my pending drafts',
    expectedToolId: 'approveDraft',
    expectedSpecialist: 'ops',
    keywords: ['approve', 'draft'],
  },
  {
    prompt: 'Create a campaign for Q3 launch',
    expectedToolId: 'campaignCreate',
    expectedSpecialist: 'ops',
    keywords: ['campaign', 'create'],
  },
  {
    prompt: 'Update campaign abc',
    expectedToolId: 'campaignUpdate',
    expectedSpecialist: 'ops',
    keywords: ['campaign', 'update'],
  },
  {
    prompt: 'Show campaign dashboard for abc',
    expectedToolId: 'campaignDashboard',
    expectedSpecialist: 'ops',
    keywords: ['campaign', 'dashboard'],
  },
  {
    prompt: 'Tag a post to campaign abc',
    expectedToolId: 'campaignTag',
    expectedSpecialist: 'ops',
    keywords: ['campaign', 'tag'],
  },
  {
    prompt: 'Show my comments inbox',
    expectedToolId: 'commentsInbox',
    expectedSpecialist: 'ops',
    keywords: ['comments', 'inbox'],
  },
  {
    prompt: 'Reply to comment 456',
    expectedToolId: 'commentReply',
    expectedSpecialist: 'ops',
    keywords: ['comment', 'reply'],
  },
];

const findToolById = (
  tools: Record<string, any>,
  id: string
): { key: string; tool: any } | undefined => {
  for (const [key, tool] of Object.entries(tools)) {
    if (tool?.id === id) {
      return { key, tool };
    }
  }
  return undefined;
};

const descriptionMatches = (tool: any, keywords: string[]): boolean => {
  const description = (tool?.description ?? '').toLowerCase();
  return keywords.every((kw) => description.includes(kw.toLowerCase()));
};

describe('routing eval', () => {
  const supervisorMode = process.env.AGENT_SUPERVISOR_ENABLED !== 'false';

  it('has at least 30 routing cases', () => {
    expect(ROUTING_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it('builds the flat tool set for the eval harness', async () => {
    const tools = await buildFlatTools();
    expect(Object.keys(tools).length).toBeGreaterThanOrEqual(toolList.length);
  });

  it('every expected tool id is present in the flat tool set', async () => {
    const tools = await buildFlatTools();
    for (const testCase of ROUTING_CASES) {
      const found = findToolById(tools, testCase.expectedToolId);
      expect(found).toBeDefined();
    }
  });

  for (const testCase of ROUTING_CASES) {
    it(`${supervisorMode ? '[supervisor] ' : '[flat] '}${testCase.prompt} → ${testCase.expectedToolId}`, async () => {
      const service = await buildLoadToolsService();
      const postmill = await service.agent();

      let toolSource: Record<string, any>;
      if (!supervisorMode || testCase.expectedSpecialist === 'supervisor') {
        toolSource = await postmill.listTools();
      } else {
        const staticAgents = ((postmill as any).__getStaticAgents?.() ?? {}) as Record<string, any>;
        const specialist = staticAgents[testCase.expectedSpecialist];
        expect(specialist).toBeDefined();
        toolSource = await (specialist as any).listTools();
      }

      const found = findToolById(toolSource, testCase.expectedToolId);
      expect(found).toBeDefined();
      expect(descriptionMatches(found!.tool, testCase.keywords)).toBe(true);
    });
  }

  it('flat agent includes all expected tools directly on postmill', async () => {
    const prev = process.env.AGENT_SUPERVISOR_ENABLED;
    process.env.AGENT_SUPERVISOR_ENABLED = 'false';
    const service = await buildLoadToolsService();
    const postmill = await service.agent();
    const tools = await postmill.listTools();

    for (const testCase of ROUTING_CASES) {
      const found = findToolById(tools, testCase.expectedToolId);
      expect(found, `missing ${testCase.expectedToolId}`).toBeDefined();
      expect(
        descriptionMatches(found!.tool, testCase.keywords),
        `description mismatch for ${testCase.expectedToolId}`
      ).toBe(true);
    }

    process.env.AGENT_SUPERVISOR_ENABLED = prev;
  });

  if (supervisorMode) {
    it('MCP flat-surface parity: union of supervisor + specialist tools contains all Phase 1 tool ids', async () => {
      const service = await buildLoadToolsService();
      const postmill = await service.agent();
      const postmillTools = await postmill.listTools();
      const staticAgents = ((postmill as any).__getStaticAgents?.() ?? {}) as Record<string, any>;

      const union: Record<string, any> = { ...postmillTools };
      for (const sub of Object.values(staticAgents)) {
        Object.assign(union, await (sub as any).listTools());
      }

      for (const testCase of ROUTING_CASES) {
        const found = findToolById(union, testCase.expectedToolId);
        expect(found, `union missing ${testCase.expectedToolId}`).toBeDefined();
      }
    });
  }

  if (liveEval) {
    it('live-eval smoke: agent object exposes the expected generate/stream surface', async () => {
      const service = await buildLoadToolsService();
      const postmill = await service.agent();

      expect(typeof (postmill as any).generate).toBe('function');
      expect(typeof (postmill as any).stream).toBe('function');

      const tools = await postmill.listTools();
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });
  }
});
