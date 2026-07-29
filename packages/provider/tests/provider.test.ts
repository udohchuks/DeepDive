import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import {
  AnthropicModelProvider,
  DeepSeekModelProvider,
  createModelProvider,
  MissingApiKeyError,
  executeStructuredModelCall,
  StructuredOutputValidationError,
  RecordedFixtureProvider,
  FixtureCacheMissError,
  PINNED_CLAUDE_MODEL,
  PINNED_DEEPSEEK_MODEL,
  EnvironmentKeyStore,
  OpenRouterModelProvider,
  PINNED_OPENROUTER_MODEL,
  UnpinnedModelError,
  assertPinnedModel,
} from '../src/index.js';

describe('Model Provider & Determinism Controls (Phase 2.3)', () => {
  it('PINNED MODEL: uses pinned model version string, never -latest alias (D-5)', () => {
    expect(PINNED_CLAUDE_MODEL).not.toContain('latest');
    expect(PINNED_CLAUDE_MODEL).toBe('claude-3-5-sonnet-20241022');
    expect(PINNED_DEEPSEEK_MODEL).toBe('deepseek-chat');
  });

  it('handles missing API key cleanly with typed error without leaking secrets', async () => {
    const mockKeyStore = { getApiKey: () => null };
    const provider = new AnthropicModelProvider(mockKeyStore);

    const schema = z.object({ verdict: z.string() });
    await expect(
      provider.generateStructured({
        role: 'grader',
        promptVersion: 'v1',
        systemPrompt: 'System',
        userPrompt: 'User',
        schema,
      }),
    ).rejects.toThrow(MissingApiKeyError);

    // Verify key string never appears in error message
    const err = new MissingApiKeyError('anthropic');
    expect(err.message).not.toContain('sk-');
  });

  it('DeepSeekModelProvider throws MissingApiKeyError cleanly when DEEPSEEK_API_KEY is missing', async () => {
    const mockKeyStore = { getApiKey: () => null };
    const provider = new DeepSeekModelProvider(mockKeyStore);
    const schema = z.object({ verdict: z.string() });

    await expect(
      provider.generateStructured({
        role: 'verifier',
        promptVersion: 'v1',
        systemPrompt: 'System',
        userPrompt: 'User',
        schema,
      }),
    ).rejects.toThrow(MissingApiKeyError);
  });

  it('createModelProvider instantiates requested provider type', () => {
    const deepseek = createModelProvider('deepseek', { getApiKey: () => 'key' });
    expect(deepseek).toBeInstanceOf(DeepSeekModelProvider);

    const anthropic = createModelProvider('anthropic', { getApiKey: () => 'key' });
    expect(anthropic).toBeInstanceOf(AnthropicModelProvider);
  });

  it('EnvironmentKeyStore resolves DEEPSEEK_API_KEY from environment', () => {
    process.env.DEEPSEEK_API_KEY = 'test_deepseek_key';
    const keyStore = new EnvironmentKeyStore();
    expect(keyStore.getApiKey('deepseek')).toBe('test_deepseek_key');
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('PROTECTED INVARIANT D-2: invalid model response retried exactly twice then fails typed (never coerced)', async () => {
    let callCount = 0;
    const mockCallFn = async (_prompt: string, _temp: number) => {
      callCount += 1;
      return 'invalid json string payload'; // Fails Zod schema & JSON parse
    };

    const schema = z.object({ verdict: z.string() });

    await expect(
      executeStructuredModelCall(
        {
          role: 'grader',
          promptVersion: 'v1',
          systemPrompt: 'System',
          userPrompt: 'User',
          schema,
          temperature: 0,
        },
        mockCallFn,
      ),
    ).rejects.toThrow(StructuredOutputValidationError);

    // Initial call + 2 retries = 3 calls total
    expect(callCount).toBe(3);
  });

  it('D-4: RecordedFixtureProvider replays fixtures and throws FixtureCacheMissError on miss', async () => {
    const fixtureProvider = new RecordedFixtureProvider();
    const schema = z.object({ verdict: z.string() });

    fixtureProvider.registerFixture('grader', 'v1', 'Submit User Prompt', { verdict: 'approved' });

    const result = await fixtureProvider.generateStructured({
      role: 'grader',
      promptVersion: 'v1',
      systemPrompt: 'System',
      userPrompt: 'Submit User Prompt',
      schema,
    });
    expect(result).toEqual({ verdict: 'approved' });

    // Unregistered payload causes hard FixtureCacheMissError printing missing key
    await expect(
      fixtureProvider.generateStructured({
        role: 'grader',
        promptVersion: 'v1',
        systemPrompt: 'System',
        userPrompt: 'Unseen Prompt Payload',
        schema,
      }),
    ).rejects.toThrow(FixtureCacheMissError);
  });
});


describe('Multi-provider key isolation and model pinning', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('PROTECTED INVARIANT: a provider never falls back to another vendor\'s API key', () => {
    const keyStore = new EnvironmentKeyStore();
    process.env.OPENAI_API_KEY = 'openai_secret';
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;

    // An OpenAI key must never be transmitted to DeepSeek or OpenRouter endpoints.
    expect(keyStore.getApiKey('deepseek')).toBeNull();
    expect(keyStore.getApiKey('openrouter')).toBeNull();
    expect(keyStore.getApiKey('anthropic')).toBeNull();
    expect(keyStore.getApiKey('openai')).toBe('openai_secret');
  });

  it('resolves each provider from its own environment variable', () => {
    const keyStore = new EnvironmentKeyStore();
    process.env.OPENROUTER_API_KEY = 'or_key';
    process.env.DEEPSEEK_API_KEY = 'ds_key';
    process.env.CLAUDE_API_KEY = 'claude_key';

    expect(keyStore.getApiKey('openrouter')).toBe('or_key');
    expect(keyStore.getApiKey('deepseek')).toBe('ds_key');
    expect(keyStore.getApiKey('anthropic')).toBe('claude_key');
  });

  it('createModelProvider selects OpenRouter and it defaults to a pinned slug', () => {
    const provider = createModelProvider('openrouter', { getApiKey: () => 'k' });
    expect(provider).toBeInstanceOf(OpenRouterModelProvider);
    expect((provider as OpenRouterModelProvider).model).toBe(PINNED_OPENROUTER_MODEL);
    expect((provider as OpenRouterModelProvider).baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('OpenRouterModelProvider throws MissingApiKeyError when its key is absent', async () => {
    const provider = new OpenRouterModelProvider({ getApiKey: () => null });
    await expect(
      provider.generateStructured({ role: 'grader', promptVersion: 'v1', prompt: 'x', schema: z.string() }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('PROTECTED INVARIANT: a moving model alias is rejected at construction (D-5)', () => {
    expect(() => new OpenRouterModelProvider({ getApiKey: () => 'k' }, { model: 'anthropic/claude-latest' })).toThrow(
      UnpinnedModelError,
    );
    expect(() => new DeepSeekModelProvider({ getApiKey: () => 'k' }, { model: 'deepseek-latest' })).toThrow(
      UnpinnedModelError,
    );
    expect(assertPinnedModel('deepseek-chat')).toBe('deepseek-chat');
  });
});
