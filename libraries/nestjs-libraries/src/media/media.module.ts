import { Module, OnModuleInit } from '@nestjs/common';
import { MediaProviderRegistry } from './media-provider.registry';
import { FalAdapter } from './adapters/fal.adapter';
import { OpenaiMediaAdapter } from './adapters/openai-media.adapter';
import { ElevenLabsAdapter } from './adapters/elevenlabs.adapter';
import { HeyGenAdapter } from './adapters/heygen.adapter';
import { RunwayAdapter } from './adapters/runway.adapter';
import { BlackForestLabsAdapter } from './adapters/black-forest-labs.adapter';
import { VertexMediaAdapter } from './adapters/vertex-media.adapter';
import { ReplicateMediaAdapter } from './adapters/replicate.adapter';
import { StabilityAdapter } from './adapters/stability.adapter';
import { TavusAdapter } from './adapters/tavus.adapter';
import { DIDAdapter } from './adapters/did.adapter';
import { HedraAdapter } from './adapters/hedra.adapter';
import { MiniMaxMediaAdapter } from './adapters/minimax-media.adapter';
import { DeepgramAdapter } from './adapters/deepgram.adapter';
import { LumaAdapter } from './adapters/luma.adapter';

const ALL_ADAPTERS = [
  FalAdapter,
  OpenaiMediaAdapter,
  ElevenLabsAdapter,
  HeyGenAdapter,
  RunwayAdapter,
  BlackForestLabsAdapter,
  VertexMediaAdapter,
  ReplicateMediaAdapter,
  StabilityAdapter,
  TavusAdapter,
  DIDAdapter,
  HedraAdapter,
  MiniMaxMediaAdapter,
  DeepgramAdapter,
  LumaAdapter,
];

@Module({
  providers: [MediaProviderRegistry],
  exports: [MediaProviderRegistry],
})
export class MediaModule implements OnModuleInit {
  constructor(private readonly _registry: MediaProviderRegistry) {}

  onModuleInit() {
    for (const AdapterClass of ALL_ADAPTERS) {
      const adapter = new AdapterClass();
      this._registry.register(adapter);
    }
  }
}
