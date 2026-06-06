import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const OLD_ENV = { ...process.env };

const mockOpenAIAdapterInstance = { mock: 'OpenAIAdapter' };
const mockAnthropicAdapterInstance = { mock: 'AnthropicAdapter' };
const mockGoogleAdapterInstance = { mock: 'GoogleGenerativeAIAdapter' };
const mockGroqAdapterInstance = { mock: 'GroqAdapter' };
const mockLangChainAdapterInstance = { mock: 'LangChainAdapter' };
vi.mock('@copilotkit/runtime', () => ({
  AnthropicAdapter: class {
    constructor(opts: any) {
      Object.assign(this, opts);
      return mockAnthropicAdapterInstance;
    }
  },
  CopilotRuntime: class {},
  GoogleGenerativeAIAdapter: class {
    constructor(opts: any) {
      Object.assign(this, opts);
      return mockGoogleAdapterInstance;
    }
  },
  GroqAdapter: class {
    constructor(opts: any) {
      Object.assign(this, opts);
      return mockGroqAdapterInstance;
    }
  },
  LangChainAdapter: class {
    constructor(opts: any) {
      Object.assign(this, opts);
      return mockLangChainAdapterInstance;
    }
  },
  OpenAIAdapter: class {
    constructor(opts: any) {
      Object.assign(this, opts);
      return mockOpenAIAdapterInstance;
    }
  },
  copilotRuntimeNodeHttpEndpoint: vi.fn().mockReturnValue(vi.fn()),
  copilotRuntimeNextJSAppRouterEndpoint: vi.fn().mockReturnValue({
    handleRequest: vi.fn(),
  }),
}));

const mockOpenAIClass = vi.fn();
vi.mock('openai', () => ({
  default: class {
    constructor(opts: any) {
      mockOpenAIClass(opts);
    }
  },
}));

const mockAnthropicClass = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor(opts: any) {
      mockAnthropicClass(opts);
    }
  },
}));

const mockGroqClass = vi.fn();
vi.mock('groq-sdk', () => ({
  Groq: class {
    constructor(opts: any) {
      mockGroqClass(opts);
    }
  },
}));

const mockLanguageModel = {
  modelId: 'gpt-5.2',
  doGenerate: vi.fn().mockResolvedValue({ text: 'agent response' }),
};

const mockOpenaiAdapter = {
  identifier: 'openai',
  name: 'OpenAI',
  type: 'direct',
  credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
  capabilities: { text: true, image: true, vision: true, embeddings: true, speech: true, tools: true },
  listModels: vi.fn().mockResolvedValue([]),
  createLanguageModel: vi.fn().mockReturnValue(mockLanguageModel),
};

const mockAnthropicAdapter = {
  identifier: 'anthropic',
  name: 'Anthropic',
  type: 'direct',
  credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
  capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: true },
  listModels: vi.fn().mockResolvedValue([]),
  createLanguageModel: vi.fn().mockReturnValue({ modelId: 'claude-sonnet', doGenerate: vi.fn() }),
};

const mockGatewayAdapter = {
  identifier: 'gateway',
  name: 'API Gateway',
  type: 'hub',
  credentialFields: [{ key: 'baseURL', label: 'Base URL', type: 'string', required: true }],
  capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: true },
  listModels: vi.fn().mockResolvedValue([]),
  createLanguageModel: vi.fn().mockReturnValue({}),
};

const mockResolveConfigForScope = vi.fn().mockResolvedValue(null);

vi.mock('@gitroom/nestjs-libraries/ai/ai-model.provider', () => ({
  AIModelProvider: class {
    resolveConfigForScope = mockResolveConfigForScope;
    getSurfaceDefaults = vi.fn().mockReturnValue({
      textModel: 'gpt-5.2',
      imageModel: 'chatgpt-image-latest',
    });
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({
  SubscriptionService: class {},
}));

vi.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {
    mastra = vi.fn().mockResolvedValue({
      getAgent: vi.fn().mockReturnValue({
        getMemory: vi.fn().mockResolvedValue({
          listThreads: vi.fn().mockResolvedValue({ threads: [] }),
          recall: vi.fn().mockResolvedValue({ messages: [] }),
        }),
      }),
    });
  },
}));

vi.mock('@ag-ui/mastra', () => ({
  MastraAgent: {
    getLocalAgents: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('@mastra/core/di', () => ({
  RequestContext: class {
    private data = new Map<string, string>();
    set(key: string, value: string) { this.data.set(key, value); }
    get(key: string) { return this.data.get(key); }
  },
}));

import { CopilotController } from './copilot.controller';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { AIModelProvider } from '@gitroom/nestjs-libraries/ai/ai-model.provider';

describe('CopilotController', () => {
  let controller: CopilotController;
  let subscriptionService: SubscriptionService;
  let mastraService: MastraService;
  let aiModelProvider: AIModelProvider;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
    vi.clearAllMocks();
    mockOpenAIClass.mockClear();
    mockAnthropicClass.mockClear();
    mockGroqClass.mockClear();
    mockResolveConfigForScope.mockResolvedValue(null);

    subscriptionService = new (SubscriptionService as any)();
    mastraService = new (MastraService as any)();
    aiModelProvider = new (AIModelProvider as any)();

    controller = new CopilotController(
      subscriptionService,
      mastraService,
      aiModelProvider,
    );
  });

  describe('_buildServiceAdapter', () => {
    describe('no admin config', () => {
      it('creates OpenAIAdapter with env key when OPENAI_API_KEY is set (byte-for-byte fallback)', async () => {
        process.env.OPENAI_API_KEY = 'sk-env-fallback-key';
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-env-fallback-key' },
          providerId: 'openai',
        });

        const result = await (controller as any)._buildServiceAdapter(undefined);

        expect(mockOpenAIClass).toHaveBeenCalledWith({ apiKey: 'sk-env-fallback-key' });
        expect(result).toBe(mockOpenAIAdapterInstance);
        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', undefined);
      });

      it('throws 422 "AI provider not configured" when no OPENAI_API_KEY', async () => {
        process.env.OPENAI_API_KEY = '';
        mockResolveConfigForScope.mockResolvedValue(null);

        await expect((controller as any)._buildServiceAdapter(undefined)).rejects.toThrow(
          expect.objectContaining({
            message: 'AI provider not configured',
            status: HttpStatus.UNPROCESSABLE_ENTITY,
          }),
        );
      });
    });

    describe('admin config present with OpenAI provider', () => {
      it('creates OpenAIAdapter with resolved credentials from facade', async () => {
        process.env.OPENAI_API_KEY = 'sk-should-not-be-used';
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-decrypted-key' },
          providerId: 'openai',
        });

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-1');
        expect(mockOpenAIClass).toHaveBeenCalledWith(
          expect.objectContaining({ apiKey: 'sk-decrypted-key' }),
        );
        expect(result).toBe(mockOpenAIAdapterInstance);
      });

      it('uses scoped model from facade-resolved config', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-scoped-key' },
          providerId: 'openai',
        });

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-1');
        expect(result).toBe(mockOpenAIAdapterInstance);
      });
    });

    describe('admin config present with native CopilotKit provider', () => {
      it('creates AnthropicAdapter for Anthropic', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockAnthropicAdapter,
          modelId: 'claude-sonnet',
          creds: { apiKey: 'sk-anthropic' },
          providerId: 'anthropic',
        });

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(mockAnthropicClass).toHaveBeenCalledWith({ apiKey: 'sk-anthropic' });
        expect(result).toBe(mockAnthropicAdapterInstance);
      });
    });

    describe('admin config present, no OPENAI_API_KEY, provider="anthropic"', () => {
      it('does NOT short-circuit to env fallback — uses configured Anthropic credentials', async () => {
        process.env.OPENAI_API_KEY = '';
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockAnthropicAdapter,
          modelId: 'claude-sonnet',
          creds: { apiKey: 'sk-anthropic' },
          providerId: 'anthropic',
        });

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(result).toBe(mockAnthropicAdapterInstance);
      });
    });

    describe('admin config with gateway adapter', () => {
      it('treats gateway as OpenAI-compatible (has baseURL field)', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockGatewayAdapter,
          modelId: 'gpt-4.1',
          creds: { apiKey: 'sk-gw-key', baseURL: 'https://my-gateway.example.com/v1' },
          providerId: 'gateway',
        });

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(mockOpenAIClass).toHaveBeenCalledWith(
          expect.objectContaining({
            apiKey: 'sk-gw-key',
            baseURL: 'https://my-gateway.example.com/v1',
          }),
        );
        expect(result).toBe(mockOpenAIAdapterInstance);
      });

      it('does not borrow OPENAI_API_KEY when active admin credentials are missing', async () => {
        process.env.OPENAI_API_KEY = 'sk-env-key';
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockGatewayAdapter,
          modelId: 'gpt-4.1',
          creds: { baseURL: 'https://my-gateway.example.com/v1' },
          providerId: 'gateway',
        });

        await expect((controller as any)._buildServiceAdapter('org-1')).rejects.toThrow(
          expect.objectContaining({
            message: 'AI provider credentials not configured',
            status: HttpStatus.UNPROCESSABLE_ENTITY,
          }),
        );
        expect(mockOpenAIClass).not.toHaveBeenCalled();
      });
    });

    describe('resolveConfigForScope returns null (facade could not resolve)', () => {
      it('falls back to env key when env key is set', async () => {
        process.env.OPENAI_API_KEY = 'sk-fallback-adapter-missing';
        mockResolveConfigForScope.mockResolvedValue(null);

        const result = await (controller as any)._buildServiceAdapter('org-1');

        expect(mockOpenAIClass).toHaveBeenCalledWith({ apiKey: 'sk-fallback-adapter-missing' });
        expect(result).toBe(mockOpenAIAdapterInstance);
      });

      it('throws 422 when no env key either', async () => {
        process.env.OPENAI_API_KEY = '';
        mockResolveConfigForScope.mockResolvedValue(null);

        await expect((controller as any)._buildServiceAdapter('org-1')).rejects.toThrow(
          expect.objectContaining({
            message: 'AI provider not configured',
            status: HttpStatus.UNPROCESSABLE_ENTITY,
          }),
        );
      });
    });

    describe('per-org BYOK overrides', () => {
      it('uses credentials from per-org BYOK resolved by the facade', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-byok-org-key' },
          providerId: 'openai',
        });

        const result = await (controller as any)._buildServiceAdapter('org-byok');

        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-byok');
        expect(mockOpenAIClass).toHaveBeenCalledWith(
          expect.objectContaining({ apiKey: 'sk-byok-org-key' }),
        );
        expect(result).toBe(mockOpenAIAdapterInstance);
      });
    });

    describe('orgId threading', () => {
      it('passes orgId to resolveConfigForScope', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-org-test' },
          providerId: 'openai',
        });

        await (controller as any)._buildServiceAdapter('org-42');

        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-42');
      });

      it('passes undefined orgId when not provided', async () => {
        mockResolveConfigForScope.mockResolvedValue({
          adapter: mockOpenaiAdapter,
          modelId: 'gpt-5.2',
          creds: { apiKey: 'sk-no-org' },
          providerId: 'openai',
        });

        await (controller as any)._buildServiceAdapter(undefined);

        expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', undefined);
      });
    });
  });

  describe('/chat endpoint', () => {
    // §3.3 #4: /chat is intentionally ungated to preserve pre-v3.4.0 behaviour
    // (it was ungated before and wraps the whole app layout). The asymmetry with
    // /agent (which IS gated) is deliberate — assert NO policy metadata here.
    it('is intentionally ungated (preserves pre-v3.4.0 behaviour)', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        CopilotController.prototype.chatAgent,
      );

      expect(policies).toBeUndefined();
    });

    it('calls service adapter builder with organization.id', async () => {
      process.env.OPENAI_API_KEY = 'sk-chat-test';
      mockResolveConfigForScope.mockResolvedValue({
        adapter: mockOpenaiAdapter,
        modelId: 'gpt-5.2',
        creds: { apiKey: 'sk-chat-test' },
        providerId: 'openai',
      });
      const req = { body: {} } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const org = { id: 'org-chat-1' } as any;

      await controller.chatAgent(req, res, org);

      expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-chat-1');
    });

    it('re-throws HttpException when adapter resolution fails', async () => {
      process.env.OPENAI_API_KEY = '';
      mockResolveConfigForScope.mockResolvedValue(null);
      const req = { body: {} } as any;
      const res = {} as any;

      await expect(controller.chatAgent(req, res)).rejects.toThrow(HttpException);
    });
  });

  describe('/agent endpoint', () => {
    it('calls service adapter builder with organization.id', async () => {
      process.env.OPENAI_API_KEY = 'sk-agent-test';
      mockResolveConfigForScope.mockResolvedValue({
        adapter: mockOpenaiAdapter,
        modelId: 'gpt-5.2',
        creds: { apiKey: 'sk-agent-test' },
        providerId: 'openai',
      });
      const req = { body: { variables: { properties: { integrations: [] } } } } as any;
      const res = {} as any;
      const org = { id: 'org-agent-1' } as any;

      await controller.agent(req, res, org);

      expect(mockResolveConfigForScope).toHaveBeenCalledWith('agent', 'org-agent-1');
    });

    it('re-throws HttpException when adapter fails for agent', async () => {
      process.env.OPENAI_API_KEY = '';
      mockResolveConfigForScope.mockResolvedValue(null);
      const req = { body: { variables: { properties: { integrations: [] } } } } as any;
      const res = {} as any;
      const org = { id: 'org-agent-fail' } as any;

      await expect(controller.agent(req, res, org)).rejects.toThrow(HttpException);
    });
  });
});
