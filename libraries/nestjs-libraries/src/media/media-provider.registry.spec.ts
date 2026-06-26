import { describe, it, expect } from 'vitest';
import { MediaProviderRegistry } from './media-provider.registry';
import { MediaModule } from './media.module';
import { FeatureFlagsService } from '@gitroom/nestjs-libraries/feature-flags';
import { FalAdapter } from './adapters/fal.adapter';
import { LumaAdapter } from './adapters/luma.adapter';

describe('MediaProviderRegistry', () => {
  it('registers and resolves adapters by identifier', () => {
    const registry = new MediaProviderRegistry();
    const fal = new FalAdapter();
    registry.register(fal);
    expect(registry.get('fal')).toBe(fal);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('lists all adapters and their capabilities', () => {
    const registry = new MediaProviderRegistry();
    registry.register(new FalAdapter());
    registry.register(new LumaAdapter());

    expect(registry.getAll()).toHaveLength(2);
    const caps = registry.getCapabilities();
    expect(caps.fal.image).toBe(true);
    expect(caps.luma.video).toBe(true);
    expect(caps.luma.image).toBe(false);
  });
});

describe('MediaModule', () => {
  it('registers all adapters on init', () => {
    const registry = new MediaProviderRegistry();
    const flags = new FeatureFlagsService();
    const mediaModule = new MediaModule(registry, flags);
    mediaModule.onModuleInit();

    const ids = registry.getAll().map((a) => a.identifier).sort();
    expect(ids).toEqual([
      'azure',
      'bedrock',
      'black-forest-labs',
      'deepgram',
      'deepinfra',
      'did',
      'elevenlabs',
      'fal',
      'fireworks',
      'gateway',
      'groq',
      'hedra',
      'heygen',
      'luma',
      'minimax',
      'openai',
      'openrouter',
      'qwen',
      'replicate',
      'runway',
      'siliconflow',
      'stability-ai',
      'tavus',
      'togetherai',
      'vertex',
      'wan',
    ]);
  });
});
