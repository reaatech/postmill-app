import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    languageModel: vi.fn(() => ({ modelId: 'test-model' })),
    imageModel: vi.fn(function() { return {}; }),
    textEmbeddingModel: vi.fn(function() { return {}; }),
  })),
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(function() { return {}; }),
}));

import { OpenAICompatibleAdapter } from '../domains/ai-helpers';

describe('OpenAICompatibleAdapter', () => {
  let adapter: OpenAICompatibleAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAICompatibleAdapter(
      'test-hub',
      'Test Hub',
      'https://api.test-hub.com/v1',
      { text: true, image: true, vision: false, embeddings: false, speech: false, tools: true },
    );
  });

  describe('metadata', () => {
    it('uses the provided identifier', () => {
      expect(adapter.identifier).toBe('test-hub');
    });

    it('uses the provided name', () => {
      expect(adapter.name).toBe('Test Hub');
    });

    it('defaults to "hub" type when not specified', () => {
      expect(adapter.type).toBe('hub');
    });

    it('allows overriding the type to "direct"', () => {
      const directAdapter = new OpenAICompatibleAdapter(
        'direct-id',
        'Direct',
        'https://api.example.com/v1',
        undefined,
        undefined,
        'direct',
      );
      expect(directAdapter.type).toBe('direct');
    });

    it('has credentialFields for apiKey and baseURL', () => {
      const keys = adapter.credentialFields.map((f) => f.key);
      expect(keys).toContain('apiKey');
      expect(keys).toContain('baseURL');
      expect(adapter.credentialFields.find((f) => f.key === 'apiKey')?.required).toBe(true);
    });

    it('has baseURL credential with the provided URL as placeholder', () => {
      const baseField = adapter.credentialFields.find((f) => f.key === 'baseURL');
      expect(baseField?.placeholder).toBe('https://api.test-hub.com/v1');
    });

    it('reflects the provided capabilities', () => {
      expect(adapter.capabilities).toEqual({
        text: true,
        image: true,
        vision: false,
        embeddings: false,
        speech: false,
        tools: true,
      });
    });
  });

  describe('listModels', () => {
    it('returns default models when apiKey or baseURL is missing', async () => {
      const models = await adapter.listModels({});
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('default');
      expect(models[0].label).toContain('Test Hub');
    });

    it('returns default models when only apiKey is provided without baseURL', async () => {
      const models = await adapter.listModels({ apiKey: 'test-key' });
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('default');
    });

    it('returns default models when fetch fails', async () => {
      const models = await adapter.listModels({
        apiKey: 'test-key',
        baseURL: 'https://invalid.example.com/v1',
      });
      expect(Array.isArray(models)).toBe(true);
      expect(models[0].id).toBe('default');
    });
  });

  describe('validateCredentials', () => {
    it('returns error for empty apiKey', async () => {
      const result = await adapter.validateCredentials({});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('API key is required');
    });

    it('returns error when baseURL is missing', async () => {
      const result = await adapter.validateCredentials({ apiKey: 'test-key' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Base URL is required to validate credentials');
    });

    it('returns error on network failure', async () => {
      const result = await adapter.validateCredentials({
        apiKey: 'test-key',
        baseURL: 'https://invalid.example.com/v1',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createLanguageModel', () => {
    it('returns a language model for the given model id', () => {
      const model = adapter.createLanguageModel(
        { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' },
        'test-model-1',
      );
      expect(model).toBeDefined();
    });

    it('works with multiple model ids', () => {
      const creds = { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' };
      const modelA = adapter.createLanguageModel(creds, 'model-a');
      const modelB = adapter.createLanguageModel(creds, 'model-b');
      expect(modelA).toBeDefined();
      expect(modelB).toBeDefined();
    });
  });

  describe('createLangchainModel', () => {
    it('builds a ChatOpenAI instance with options', () => {
      const model = adapter.createLangchainModel(
        { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' },
        'langchain-model',
        { temperature: 0.7, topP: 0.9, maxTokens: 2048 },
      );
      expect(model).toBeDefined();
    });

    it('handles missing optional parameters', () => {
      const model = adapter.createLangchainModel(
        { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' },
        'simple-model',
      );
      expect(model).toBeDefined();
    });

    it('handles missing baseURL gracefully', () => {
      const model = adapter.createLangchainModel({ apiKey: 'test-key' }, 'test-model');
      expect(model).toBeDefined();
    });
  });

  describe('createImageModel', () => {
    it('returns an image model when called', () => {
      const model = adapter.createImageModel(
        { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' },
        'test-image-model',
      );
      expect(model).toBeDefined();
    });
  });

  describe('createEmbeddingModel', () => {
    it('returns an embedding model', () => {
      const model = adapter.createEmbeddingModel(
        { apiKey: 'test-key', baseURL: 'https://api.example.com/v1' },
        'test-embedding-model',
      );
      expect(model).toBeDefined();
    });
  });

  describe('baseURL normalization', () => {
    it('strips trailing slashes from baseURL before calling validateCredentials fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

      await adapter.validateCredentials({ apiKey: 'test-key', baseURL: 'https://api.example.com/v1//' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/v1/models',
        expect.objectContaining({ headers: expect.anything() }),
      );
      fetchSpy.mockRestore();
    });

    it.each([
      { input: 'a', expected: 'a/models' },
      { input: 'a/', expected: 'a/models' },
      { input: 'a///', expected: 'a/models' },
    ])('normalizes baseURL "$input" to "$expected" in listModels', async ({ input, expected }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

      await adapter.listModels({ apiKey: 'test-key', baseURL: input });

      expect(fetchSpy).toHaveBeenCalledWith(
        expected,
        expect.objectContaining({ headers: expect.anything() }),
      );
      fetchSpy.mockRestore();
    });

    it.each([
      { input: '', expected: '' },
      { input: 'a', expected: 'a' },
      { input: 'a/', expected: 'a' },
      { input: 'a///', expected: 'a' },
    ])('normalizes baseURL "$input" to "$expected" (regex sanity)', ({ input, expected }) => {
      const normalized = (input || '').replace(/(?<![/])\/+$/, '');
      expect(normalized).toBe(expected);
    });
  });
});
