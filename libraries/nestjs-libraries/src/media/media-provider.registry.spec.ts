import { describe, it, expect } from 'vitest';
import { MediaProviderRegistry } from './media-provider.registry';
import { MediaModule } from './media.module';
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
  it('registers all 15 adapters on init', () => {
    const registry = new MediaProviderRegistry();
    const mediaModule = new MediaModule(registry);
    mediaModule.onModuleInit();

    const ids = registry.getAll().map((a) => a.identifier).sort();
    expect(ids).toEqual([
      'black-forest-labs',
      'deepgram',
      'did',
      'elevenlabs',
      'fal',
      'hedra',
      'heygen',
      'luma',
      'minimax',
      'openai',
      'replicate',
      'runway',
      'stability-ai',
      'tavus',
      'vertex',
    ]);
  });
});
