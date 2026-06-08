import { Module, Global, OnModuleInit, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AIProviderRegistry } from './ai-provider.registry';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { GatewayAdapter } from './adapters/gateway.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GoogleAdapter } from './adapters/google.adapter';
import { BedrockAdapter } from './adapters/bedrock.adapter';
import { VertexAdapter } from './adapters/vertex.adapter';
import { AzureAdapter } from './adapters/azure.adapter';
import { GroqAdapter } from './adapters/groq.adapter';
import { FireworksAdapter } from './adapters/fireworks.adapter';
import { TogetherAIAdapter } from './adapters/togetherai.adapter';
import { DeepSeekAdapter } from './adapters/deepseek.adapter';
import { MistralAdapter } from './adapters/mistral.adapter';
import { CohereAdapter } from './adapters/cohere.adapter';
import { PerplexityAdapter } from './adapters/perplexity.adapter';
import { XaiAdapter } from './adapters/xai.adapter';
import { AIModelProvider } from './ai-model.provider';
import { TelemetryService } from './governance/telemetry.service';
import { ProviderHealthService } from './governance/provider-health.service';
import { RagService } from './governance/rag.service';
import { BudgetService } from './governance/budget.service';
import { BudgetMiddleware } from './governance/budget.middleware';
import { GuardrailService } from './governance/guardrail.service';
import { AiThrottlerGuard } from './governance/ai-throttler.guard';
import { AiMediaService } from './governance/media.service';
import { SemanticCacheService } from './governance/semantic-cache.service';
import { ModelRouterService } from './governance/model-router.service';
import { CircuitBreakerService } from './governance/circuit-breaker.service';
import { ToolFirewallService } from './governance/tool-firewall.service';
import { IdempotencyFactory } from './governance/idempotency.factory';

@Global()
@Module({
  providers: [
    AIProviderRegistry,
    OpenAIAdapter,
    GatewayAdapter,
    OpenRouterAdapter,
    AnthropicAdapter,
    GoogleAdapter,
    BedrockAdapter,
    VertexAdapter,
    AzureAdapter,
    GroqAdapter,
    FireworksAdapter,
    TogetherAIAdapter,
    DeepSeekAdapter,
    MistralAdapter,
    CohereAdapter,
    PerplexityAdapter,
    XaiAdapter,
    AIModelProvider,
    TelemetryService,
    ProviderHealthService,
    BudgetService,
    BudgetMiddleware,
    GuardrailService,
    AiThrottlerGuard,
    AiMediaService,
    RagService,
    SemanticCacheService,
    ModelRouterService,
    CircuitBreakerService,
    ToolFirewallService,
    IdempotencyFactory,
  ],
  exports: [
    AIProviderRegistry,
    AIModelProvider,
    TelemetryService,
    ProviderHealthService,
    BudgetService,
    GuardrailService,
    AiThrottlerGuard,
    AiMediaService,
    RagService,
    SemanticCacheService,
    ModelRouterService,
    CircuitBreakerService,
    ToolFirewallService,
    IdempotencyFactory,
  ],
})
export class AiModule implements OnModuleInit, NestModule {
  constructor(
    private readonly _registry: AIProviderRegistry,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    // MCP entrypoints are raw Express middleware in start.mcp.ts —
    // they are not Nest controllers. Budget enforcement for MCP routes
    // is handled inline in start.mcp.ts via BudgetService.
    consumer
      .apply(BudgetMiddleware)
      .forRoutes(
        { path: 'agents/{*splat}', method: RequestMethod.ALL },
        { path: 'posts/generator', method: RequestMethod.ALL },
        { path: 'copilot/{*splat}', method: RequestMethod.ALL },
      );
  }

  onModuleInit() {
    this._registry.register(new OpenAIAdapter());
    this._registry.register(new GatewayAdapter());
    this._registry.register(new OpenRouterAdapter());
    this._registry.register(new AnthropicAdapter());
    this._registry.register(new GoogleAdapter());
    this._registry.register(new BedrockAdapter());
    this._registry.register(new VertexAdapter());
    this._registry.register(new AzureAdapter());
    this._registry.register(new GroqAdapter());
    this._registry.register(new FireworksAdapter());
    this._registry.register(new TogetherAIAdapter());
    this._registry.register(new DeepSeekAdapter());
    this._registry.register(new MistralAdapter());
    this._registry.register(new CohereAdapter());
    this._registry.register(new PerplexityAdapter());
    this._registry.register(new XaiAdapter());

    const compatAdapters = [
      new OpenAICompatibleAdapter('siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1', { image: true, embeddings: true }),
      new OpenAICompatibleAdapter('deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai', { embeddings: true }),
      new OpenAICompatibleAdapter('minimax', 'MiniMax', 'https://api.minimax.chat/v1', { image: true }),
      new OpenAICompatibleAdapter('qwen', 'Qwen (Model Studio)', 'https://dashscope.aliyuncs.com/compatible-mode/v1', { image: true, vision: true }),
      new OpenAICompatibleAdapter('meta-llama', 'Meta AI (Llama API)', 'https://api.llama-api.com'),
      new OpenAICompatibleAdapter('gmihub', 'GMI Cloud', 'https://api.gmihub.ai/v1'),
      new OpenAICompatibleAdapter('bitdeer', 'Bitdeer AI', 'https://ai.bitdeer.com/v1'),
      new OpenAICompatibleAdapter('lightning', 'Lightning AI', 'https://api.lightning.ai/v1'),
      new OpenAICompatibleAdapter('vultr', 'Vultr Inference', 'https://api.vultr.com/v1'),
    ];
    for (const adapter of compatAdapters) {
      this._registry.register(adapter);
    }
  }
}
