import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLanguageModelFn = vi.fn().mockResolvedValue({ id: 'agent-model' });

const mockModuleRefGet = vi.fn();

vi.mock('@gitroom/nestjs-libraries/ai/ai-model.provider', () => ({
  AIModelProvider: class {
    languageModel = mockLanguageModelFn;
  },
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    id: string;
    name: string;
    description: string;
    instructions: any;
    model: any;
    tools: any;
    memory: any;

    constructor(config: any) {
      this.id = config.id;
      this.name = config.name;
      this.description = config.description;
      this.instructions = config.instructions;
      this.model = config.model;
      this.tools = config.tools;
      this.memory = config.memory;
    }
  },
}));

vi.mock('@mastra/memory', () => ({
  Memory: class {
    storage: any;
    options: any;

    constructor(config: any) {
      this.storage = config.storage;
      this.options = config.options;
    }
  },
}));

vi.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => ({
  pStore: { _type: 'mastra.pg.store' },
}));

vi.mock('@nestjs/core', () => ({
  ModuleRef: class {
    get = mockModuleRefGet;
  },
}));

vi.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [],
}));

vi.mock('dayjs', () => {
  const actualDayjs = vi.importActual('dayjs');
  return {
    default: () => ({
      format: () => '2026-06-05 12:00:00',
    }),
  };
});

import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { ModuleRef } from '@nestjs/core';
import { LoadToolsService, AgentState } from './load.tools.service';
import { ToolFirewallService } from '@gitroom/nestjs-libraries/ai/governance/tool-firewall.service';
import { toolList as mockToolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';

describe('LoadToolsService', () => {
  let service: LoadToolsService;
  let aiModelProvider: AIModelProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    aiModelProvider = new (AIModelProvider as any)();
    service = new LoadToolsService(
      new (ModuleRef as any)(),
      aiModelProvider,
      new ToolFirewallService(),
    );
  });

  describe('loadTools', () => {
    it('returns an empty object when toolList is empty', async () => {
      (mockToolList as any).length = 0;

      const result = await service.loadTools();

      expect(result).toEqual({});
    });

    it('loads tools from ModuleRef using toolList entries', async () => {
      const mockTool = { doSomething: vi.fn().mockResolvedValue('done') };
      mockModuleRefGet.mockReturnValueOnce({
        name: 'testTool',
        run: vi.fn().mockResolvedValue(mockTool),
      });

      (mockToolList as any).length = 0;
      (mockToolList as any).push({ _type: 'ToolClass' });

      const result = await service.loadTools();

      expect(mockModuleRefGet).toHaveBeenCalledTimes(1);
      expect(mockModuleRefGet).toHaveBeenCalledWith(
        { _type: 'ToolClass' },
        { strict: false },
      );
      expect(result).toEqual({ testTool: mockTool });
    });

    it('loads multiple tools and reduces them into a single object', async () => {
      const mockToolA = { a: vi.fn().mockResolvedValue('a') };
      const mockToolB = { b: vi.fn().mockResolvedValue('b') };

      mockModuleRefGet
        .mockReturnValueOnce({
          name: 'toolA',
          run: vi.fn().mockResolvedValue(mockToolA),
        })
        .mockReturnValueOnce({
          name: 'toolB',
          run: vi.fn().mockResolvedValue(mockToolB),
        });

      (mockToolList as any).length = 0;
      (mockToolList as any).push('ToolA', 'ToolB');

      const result = await service.loadTools();

      expect(mockModuleRefGet).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        toolA: mockToolA,
        toolB: mockToolB,
      });
    });
  });

  describe('agent', () => {
    it('calls loadTools internally', async () => {
      const spy = vi.spyOn(service, 'loadTools').mockResolvedValue({});

      await service.agent();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('creates an Agent with id "postiz"', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(agent).toBeInstanceOf(Agent as any);
      expect(agent.id).toBe('postiz');
    });

    it('creates an Agent with name "postiz" and correct description', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(agent.name).toBe('postiz');
      expect(agent.description).toBe(
        'Agent that helps manage and schedule social media posts for users',
      );
    });

    it('passes tools to the Agent constructor', async () => {
      const mockTools = { schemaTool: vi.fn(), scheduleTool: vi.fn() };
      vi.spyOn(service, 'loadTools').mockResolvedValue(mockTools);

      const agent = await service.agent();

      expect(agent.tools).toBe(mockTools);
    });

    it('creates a Memory with pStore as storage', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(agent.memory).toBeInstanceOf(Memory as any);
      expect(agent.memory.storage).toBe(pStore);
    });

    it('configures Memory with generateTitle and workingMemory options', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(agent.memory.options).toEqual({
        generateTitle: true,
        workingMemory: {
          enabled: true,
          schema: AgentState,
        },
      });
    });

    it('passes a function-form model that calls languageModel("agent")', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(typeof agent.model).toBe('function');

      const result = await agent.model();

      expect(aiModelProvider.languageModel).toHaveBeenCalledWith('agent', undefined);
      expect(result).toEqual({ id: 'agent-model' });
    });

    it('calls languageModel with "agent" scope on each invocation', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});
      mockLanguageModelFn.mockClear();

      const agent = await service.agent();

      await agent.model();
      await agent.model();

      expect(aiModelProvider.languageModel).toHaveBeenCalledTimes(2);
      expect(aiModelProvider.languageModel).toHaveBeenCalledWith('agent', undefined);
    });

    it('passes organization id from request context to the model resolver', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});
      mockLanguageModelFn.mockClear();

      const agent = await service.agent();
      const requestContext = new Map();
      requestContext.set('organization', JSON.stringify({ id: 'org-123' }));

      await agent.model({ requestContext });

      expect(aiModelProvider.languageModel).toHaveBeenCalledWith('agent', 'org-123');
    });

    it('has an instructions property that is a function', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();

      expect(typeof agent.instructions).toBe('function');
    });

    it('instructions function returns a string containing agent summary', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();
      const mockRequestContext = new Map();
      mockRequestContext.set('ui', null);

      const instructions = agent.instructions({ requestContext: mockRequestContext });

      expect(typeof instructions).toBe('string');
      expect(instructions).toContain('You are an agent that helps manage and schedule social media posts for users');
      expect(instructions).toContain('2026-06-05 12:00:00');
    });

    it('instructions function includes UI-specific text when UI context is provided', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();
      const mockRequestContext = new Map();
      mockRequestContext.set('ui', 'frontend');

      const instructions = agent.instructions({ requestContext: mockRequestContext });

      expect(instructions).toContain('If the user confirm, ask if they would like to get a modal with populated content without scheduling the post yet or if they want to schedule it right away.');
    });

    it('instructions function excludes UI-specific text when UI context is falsy', async () => {
      vi.spyOn(service, 'loadTools').mockResolvedValue({});

      const agent = await service.agent();
      const mockRequestContext = new Map();
      mockRequestContext.set('ui', null);

      const instructions = agent.instructions({ requestContext: mockRequestContext });

      expect(instructions).not.toContain('If the user confirm, ask if they would like to get a modal');
    });
  });

  describe('AgentState', () => {
    it('exports a zod schema with proverbs field', () => {
      expect(AgentState).toBeDefined();
      expect(AgentState._def).toBeDefined();
    });
  });
});
