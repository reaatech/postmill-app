import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../ai.adapter';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    languageModel: vi.fn(() => ({ modelId: 'gpt-4.1' })),
    imageModel: vi.fn(function() { return {}; }),
    textEmbeddingModel: vi.fn(function() { return {}; }),
    speechModel: vi.fn(function() { return {}; }),
  })),
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(function() { return {}; }),
}));

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAIAdapter();
  });

  describe('metadata', () => {
    it('has identifier "openai"', () => {
      expect(adapter.identifier).toBe('openai');
    });

    it('has type "direct"', () => {
      expect(adapter.type).toBe('direct');
    });

    it('has all capabilities enabled', () => {
      expect(adapter.capabilities).toEqual({
        text: true,
        image: true,
        vision: true,
        embeddings: true,
        speech: true,
        tools: true,
      });
    });

    it('has credentialFields for apiKey, baseURL, and organization', () => {
      const keys = adapter.credentialFields.map(f => f.key);
      expect(keys).toContain('apiKey');
      expect(keys).toContain('baseURL');
      expect(keys).toContain('organization');
    });
  });

  describe('listModels', () => {
    it('returns an array of ModelInfo', async () => {
      const models = await adapter.listModels({ apiKey: 'sk-test' });
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      const gpt4 = models.find(m => m.id === 'gpt-4.1');
      expect(gpt4).toBeDefined();
      expect(gpt4?.kind).toBe('text');
      expect(gpt4?.capabilities.text).toBe(true);

      const embedding = models.find(m => m.id === 'text-embedding-3-small');
      expect(embedding).toBeDefined();
      expect(embedding?.kind).toBe('embedding');
      expect(embedding?.dimension).toBe(1536);

      const image = models.find(m => m.id === 'dall-e-3');
      expect(image).toBeDefined();
      expect(image?.kind).toBe('image');
    });

    it('does not throw on bad credentials (returns static catalog)', async () => {
      const models = await adapter.listModels({});
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('validateCredentials', () => {
    it('returns error for empty apiKey', async () => {
      const result = await adapter.validateCredentials({});
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createLanguageModel', () => {
    it('returns a language model', () => {
      const model = adapter.createLanguageModel({ apiKey: 'sk-test' }, 'gpt-4.1');
      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('gpt-4.1');
    });
  });

  describe('createLangchainModel', () => {
    it('returns a langchain model', () => {
      const model = adapter.createLangchainModel({ apiKey: 'sk-test' }, 'gpt-4.1', { temperature: 0.7 });
      expect(model).toBeDefined();
    });
  });

  describe('createImageModel', () => {
    it('returns an image model', () => {
      const model = adapter.createImageModel!({ apiKey: 'sk-test' }, 'dall-e-3');
      expect(model).toBeDefined();
    });

    it('returns an image model for any model id (delegates to provider)', () => {
      const model = adapter.createImageModel!({ apiKey: 'sk-test' }, 'gpt-4.1');
      expect(model).toBeDefined();
    });
  });

  describe('createEmbeddingModel', () => {
    it('returns an embedding model', () => {
      const model = adapter.createEmbeddingModel!({ apiKey: 'sk-test' }, 'text-embedding-3-small');
      expect(model).toBeDefined();
    });
  });

  describe('createSpeechModel', () => {
    it('returns a speech model', () => {
      const model = adapter.createSpeechModel!({ apiKey: 'sk-test' }, 'tts-1');
      expect(model).toBeDefined();
    });
  });
});
