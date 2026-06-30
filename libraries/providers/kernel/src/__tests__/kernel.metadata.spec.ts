import { describe, it, expect } from 'vitest';
import { ProviderKernel } from '../kernel';
import { providerModules } from '@gitroom/backend/providers.generated';
import {
  AI_MODEL_CATEGORIES,
  AI_MEDIA_CATEGORIES,
} from '@gitroom/nestjs-libraries/ai/defaults/default-categories';

describe('ProviderKernel metadata conformance', () => {
  const kernel = new ProviderKernel();
  for (const mod of providerModules) {
    kernel.register(mod);
  }

  it('registers the real provider set', () => {
    expect(providerModules.length).toBeGreaterThan(0);
    expect(kernel.listManifests().length).toBe(providerModules.length);
  });

  it('returns metadata via getMetadata for a sample provider', () => {
    const ai = kernel.getMetadata('ai', 'openai', 'v1');
    expect(ai).toBeDefined();
    expect(ai?.id).toBe('openai');

    const media = kernel.getMetadata('media', 'openai', 'v1');
    expect(media).toBeDefined();
    expect(media?.id).toBe('openai');
  });

  it('includes metadata in listManifests results', () => {
    const manifests = kernel.listManifests();
    const withMetadata = manifests.filter((m) => m.metadata);
    expect(withMetadata.length).toBe(providerModules.length);
  });

  describe.each(providerModules)(
    '$manifest.domain/$manifest.providerId@$manifest.version',
    (mod) => {
      it('has metadata whose id matches the manifest providerId', () => {
        expect(mod.metadata, 'module.metadata must be defined').toBeDefined();
        expect(mod.metadata!.id).toBe(mod.manifest.providerId);
      });

      it('declares only known model categories', () => {
        const declared = mod.metadata?.modelCategories ?? [];
        for (const cat of declared) {
          expect(
            AI_MODEL_CATEGORIES,
            `unknown model category: ${cat}`,
          ).toContain(cat);
        }
      });

      it('declares only known media categories', () => {
        const declared = mod.metadata?.mediaCategories ?? [];
        for (const cat of declared) {
          expect(
            AI_MEDIA_CATEGORIES,
            `unknown media category: ${cat}`,
          ).toContain(cat);
        }
      });
    },
  );
});
