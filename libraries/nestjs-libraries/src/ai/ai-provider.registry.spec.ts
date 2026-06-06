import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProviderRegistry } from './ai-provider.registry';
import type { AIProviderAdapter, AICapabilities } from './ai-provider.interface';

const createMockAdapter = (id: string, caps?: Partial<AICapabilities>): AIProviderAdapter => ({
  identifier: id,
  name: `Provider ${id}`,
  type: 'direct',
  credentialFields: [],
  capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: false, ...caps },
  listModels: vi.fn().mockResolvedValue([]),
  validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
  createLanguageModel: vi.fn() as any,
  createLangchainModel: vi.fn() as any,
});

describe('AIProviderRegistry', () => {
  let registry: AIProviderRegistry;

  beforeEach(() => {
    registry = new AIProviderRegistry();
  });

  describe('register', () => {
    it('registers an adapter by identifier', () => {
      const adapter = createMockAdapter('test-provider');
      registry.register(adapter);
      expect(registry.getAdapter('test-provider')).toBe(adapter);
    });

    it('overwrites an existing adapter with the same identifier', () => {
      const first = createMockAdapter('dup');
      const second = createMockAdapter('dup');
      registry.register(first);
      registry.register(second);
      expect(registry.getAdapter('dup')).toBe(second);
    });
  });

  describe('getAdapter', () => {
    it('returns undefined for an unknown identifier', () => {
      expect(registry.getAdapter('nonexistent')).toBeUndefined();
    });

    it('returns the registered adapter', () => {
      const adapter = createMockAdapter('known');
      registry.register(adapter);
      expect(registry.getAdapter('known')).toBe(adapter);
    });
  });

  describe('list', () => {
    it('returns an empty array when no adapters are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered adapters', () => {
      registry.register(createMockAdapter('a'));
      registry.register(createMockAdapter('b'));
      registry.register(createMockAdapter('c'));
      expect(registry.list()).toHaveLength(3);
    });
  });

  describe('capabilitiesFor', () => {
    it('returns capabilities for a known adapter', () => {
      const adapter = createMockAdapter('vision-provider', { vision: true });
      registry.register(adapter);
      const caps = registry.capabilitiesFor('vision-provider');
      expect(caps?.vision).toBe(true);
      expect(caps?.text).toBe(true);
    });

    it('returns undefined for an unknown adapter', () => {
      expect(registry.capabilitiesFor('unknown')).toBeUndefined();
    });
  });

  describe('modelCapabilitiesFor', () => {
    it('returns model capabilities when the model is found', async () => {
      const adapter = createMockAdapter('test');
      adapter.listModels = vi.fn().mockResolvedValue([
        { id: 'model-a', label: 'Model A', kind: 'text', capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: true } },
        { id: 'model-b', label: 'Model B', kind: 'image', capabilities: { text: false, image: true, vision: false, embeddings: false, speech: false, tools: false } },
      ]);
      registry.register(adapter);

      const caps = await registry.modelCapabilitiesFor('test', 'model-a');
      expect(caps?.text).toBe(true);
      expect(caps?.tools).toBe(true);
    });

    it('returns null for an unknown adapter', async () => {
      const result = await registry.modelCapabilitiesFor('unknown', 'any-model');
      expect(result).toBeNull();
    });

    it('returns null when the model id is not found', async () => {
      const adapter = createMockAdapter('test');
      adapter.listModels = vi.fn().mockResolvedValue([{ id: 'existing', label: 'E', kind: 'text', capabilities: { text: true, image: false, vision: false, embeddings: false, speech: false, tools: false } }]);
      registry.register(adapter);

      const result = await registry.modelCapabilitiesFor('test', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
