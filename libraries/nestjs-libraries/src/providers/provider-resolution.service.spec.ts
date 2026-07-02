import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  ProviderKernel,
  ProviderModule,
  ProviderVersionRetiredError,
} from '@gitroom/provider-kernel';
import { RuntimeContextFactory } from './runtime-context.factory';
import { ProviderResolutionService } from './provider-resolution.service';

function makeAiModule(
  overrides: Partial<ProviderModule> = {},
  version = 'v1',
  status: string = 'active',
): ProviderModule {
  return {
    manifest: {
      domain: 'ai',
      providerId: 'openai',
      version,
      displayName: 'OpenAI',
      status: status as any,
      credentialFields: [],
      capabilities: {
        text: true,
        image: true,
        vision: true,
        embeddings: true,
        speech: true,
        tools: true,
      },
    },
    create: () => ({ model: version }) as any,
    validateCredentials: async () => ({ ok: true }),
    ...overrides,
  };
}

function createResolutionService(
  kernel: ProviderKernel,
): ProviderResolutionService {
  const ports = {
    encryption: {
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
    fetch: async () => new Response(),
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    telemetry: {
      recordCall: () => {},
    },
  };

  return new ProviderResolutionService(
    kernel,
    new RuntimeContextFactory(ports as any),
    new Logger(),
  );
}

describe('ProviderResolutionService', () => {
  let kernel: ProviderKernel;
  let service: ProviderResolutionService;

  beforeEach(() => {
    kernel = new ProviderKernel();
    kernel.register(makeAiModule({}, 'v1'));
    kernel.register(makeAiModule({}, 'v2'));
    kernel.register(makeAiModule({}, 'v3', 'retired'));

    service = createResolutionService(kernel);
  });

  it('resolve-on-read uses pinned version', () => {
    const v1 = service.resolveAI('openai', { version: 'v1' });
    expect((v1 as any).model).toBe('v1');

    const v2 = service.resolveAI('openai', { version: 'v2' });
    expect((v2 as any).model).toBe('v2');
  });

  it('pin-on-write persists version and resolve-on-read uses the pinned version', () => {
    // Simulating a config write path: kernel.resolveForWrite picks the latest
    // active version and the caller persists it. A later resolve-on-read uses
    // that pinned version instead of silently moving to latest active.
    const pinned = kernel.resolveForWrite('ai', 'openai');
    expect(pinned.manifest.version).toBe('v2');

    const capability = service.resolveAI('openai', {
      version: pinned.manifest.version,
    });
    expect((capability as any).model).toBe('v2');
  });

  it('retired pin yields ProviderVersionRetiredError', () => {
    expect(() => service.resolveAI('openai', { version: 'v3' })).toThrow(
      ProviderVersionRetiredError,
    );
  });

  it('latestActiveVersion returns the highest active version', () => {
    expect(service.latestActiveVersion('ai', 'openai')).toBe('v2');
  });

  it('latestActiveVersion returns undefined for unknown provider', () => {
    expect(service.latestActiveVersion('ai', 'unknown')).toBeUndefined();
  });

  it('resolveContentPack returns the versioned content-pack capability', () => {
    kernel.register({
      manifest: {
        domain: 'contentpack',
        providerId: 'magnific',
        version: 'v1',
        displayName: 'Magnific',
        status: 'active',
        credentialFields: [],
        capabilities: ['photos', 'vectors', 'icons', 'videos'],
      },
      create: () => ({
        identifier: 'magnific',
        capabilities: ['photos', 'vectors', 'icons', 'videos'],
        search: async () => ({ items: [] }),
        resolveDownload: async () => 'https://example.com/download',
      }),
    } as ProviderModule);

    const capability = service.resolveContentPack('magnific');
    expect(capability.identifier).toBe('magnific');
    expect(capability.capabilities).toContain('photos');
  });
});
