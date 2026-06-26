import { Logger, Module, OnModuleInit, Optional } from '@nestjs/common';
import { FeatureFlagsService } from '@gitroom/nestjs-libraries/feature-flags';
import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import { MediaProviderRegistry } from './media-provider.registry';
import { setAiRegistry } from './adapters/ai-sdk-media.helper';
import { FalAdapter } from './adapters/fal.adapter';
import { OpenaiMediaAdapter } from './adapters/openai-media.adapter';
import { ElevenLabsAdapter } from './adapters/elevenlabs.adapter';
import { HeyGenAdapter } from './adapters/heygen.adapter';
import { RunwayAdapter } from './adapters/runway.adapter';
import { BlackForestLabsAdapter } from './adapters/black-forest-labs.adapter';
import { VertexMediaAdapter } from './adapters/vertex-media.adapter';
import { GoogleAiMediaAdapter } from './adapters/google-ai-media.adapter';
import { ReplicateMediaAdapter } from './adapters/replicate.adapter';
import { StabilityAdapter } from './adapters/stability.adapter';
import { TavusAdapter } from './adapters/tavus.adapter';
import { DIDAdapter } from './adapters/did.adapter';
import { HedraAdapter } from './adapters/hedra.adapter';
import { HiggsfieldAdapter } from './adapters/higgsfield.adapter';
import { MiniMaxMediaAdapter } from './adapters/minimax-media.adapter';
import { DeepgramAdapter } from './adapters/deepgram.adapter';
import { LumaAdapter } from './adapters/luma.adapter';
import { QwenMediaAdapter } from './adapters/qwen-media.adapter';
import { WanAdapter } from './adapters/wan.adapter';
import { LtxAdapter } from './adapters/ltx.adapter';
import { TogetherAiMediaAdapter } from './adapters/togetherai-media.adapter';
import { SiliconFlowMediaAdapter } from './adapters/siliconflow-media.adapter';
import { GroqMediaAdapter } from './adapters/groq-media.adapter';
import { OpenRouterMediaAdapter } from './adapters/openrouter-media.adapter';
import { FireworksMediaAdapter } from './adapters/fireworks-media.adapter';
import { DeepInfraMediaAdapter } from './adapters/deepinfra-media.adapter';
import { GatewayMediaAdapter } from './adapters/gateway-media.adapter';
import { BedrockMediaAdapter, AzureMediaAdapter } from './adapters/ai-sdk-media.adapter';
import { RecraftMediaAdapter } from './adapters/recraft-media.adapter';
import { IdeogramMediaAdapter } from './adapters/ideogram-media.adapter';
import { LeonardoMediaAdapter } from './adapters/leonardo-media.adapter';
import { XaiMediaAdapter } from './adapters/xai-media.adapter';

const ALL_ADAPTERS = [
  FalAdapter,
  OpenaiMediaAdapter,
  ElevenLabsAdapter,
  HeyGenAdapter,
  RunwayAdapter,
  BlackForestLabsAdapter,
  VertexMediaAdapter,
  GoogleAiMediaAdapter,
  ReplicateMediaAdapter,
  StabilityAdapter,
  TavusAdapter,
  DIDAdapter,
  HedraAdapter,
  HiggsfieldAdapter,
  MiniMaxMediaAdapter,
  DeepgramAdapter,
  LumaAdapter,
  QwenMediaAdapter,
  WanAdapter,
  LtxAdapter,
  TogetherAiMediaAdapter,
  SiliconFlowMediaAdapter,
  GroqMediaAdapter,
  OpenRouterMediaAdapter,
  FireworksMediaAdapter,
  DeepInfraMediaAdapter,
  GatewayMediaAdapter,
  BedrockMediaAdapter,
  AzureMediaAdapter,
  RecraftMediaAdapter,
  IdeogramMediaAdapter,
  LeonardoMediaAdapter,
  XaiMediaAdapter,
];

@Module({
  providers: [MediaProviderRegistry],
  exports: [MediaProviderRegistry],
})
export class MediaModule implements OnModuleInit {
  private readonly _logger = new Logger(MediaModule.name);

  constructor(
    private readonly _registry: MediaProviderRegistry,
    private readonly _flags: FeatureFlagsService,
    // AI hub media adapters (Bedrock/Azure/Gateway) delegate image generation to the
    // existing AI-SDK provider adapters; share the AI registry with them via the helper.
    @Optional() private readonly _aiRegistry?: AIProviderRegistry,
  ) {}

  onModuleInit() {
    if (this._flags.isDisabled('media')) {
      this._logger.log('Media module is disabled via DEV_DISABLE_MEDIA; skipping adapter registration');
      return;
    }

    if (this._aiRegistry) setAiRegistry(this._aiRegistry);

    for (const AdapterClass of ALL_ADAPTERS) {
      const adapter = new AdapterClass();
      this._registry.register(adapter);
    }
  }
}
