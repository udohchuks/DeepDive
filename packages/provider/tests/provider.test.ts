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
  OpenAiModelProvider,
  UnsupportedProviderError,
  KNOWN_PROVIDERS,
  isPiProviderId,
  callPiModel,
  UnknownModelError,
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

describe('Real model transport via pi-ai', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const req = {
    role: 'grader' as const,
    promptVersion: 'v1',
    systemPrompt: 'You grade.',
    userPrompt: 'artifact',
    schema: z.object({ verdict: z.string() }),
  };

  it('PROTECTED INVARIANT: no API key means a hard error, never an unauthenticated call', async () => {
    for (const provider of [
      new AnthropicModelProvider({ getApiKey: () => null }),
      new DeepSeekModelProvider({ getApiKey: () => null }),
      new OpenRouterModelProvider({ getApiKey: () => null }),
      new OpenAiModelProvider({ getApiKey: () => null }),
    ]) {
      await expect(provider.generateStructured(req)).rejects.toBeInstanceOf(MissingApiKeyError);
    }
  });

  it('PROTECTED INVARIANT: an unrecognized MODEL_PROVIDER throws instead of silently degrading', () => {
    expect(() => createModelProvider('nonesuch', { getApiKey: () => 'k' })).toThrow(UnsupportedProviderError);
    expect(() => createModelProvider('nonesuch', { getApiKey: () => 'k' })).toThrow(/MODEL_PROVIDER/);
  });

  it('every known provider id resolves to a real pi-ai adapter', () => {
    for (const id of KNOWN_PROVIDERS) {
      expect(isPiProviderId(id)).toBe(true);
    }
    expect(isPiProviderId('nonesuch')).toBe(false);
  });

  it('rejects a model the provider does not offer, listing known ids', async () => {
    await expect(
      callPiModel({
        providerId: 'deepseek',
        modelId: 'not-a-real-model',
        apiKey: 'k',
        userPrompt: 'x',
        providerFactory: () =>
          ({
            getModels: () => [{ id: 'deepseek-chat' }],
            streamSimple: () => {
              throw new Error('must not be reached');
            },
          }) as never,
      }),
    ).rejects.toBeInstanceOf(UnknownModelError);
  });

  it('surfaces a provider stream error as ModelCallFailedError rather than empty text', async () => {
    await expect(
      callPiModel({
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        apiKey: 'k',
        userPrompt: 'x',
        providerFactory: () =>
          ({
            getModels: () => [{ id: 'deepseek-chat' }],
            streamSimple: () => ({
              result: async () => ({
                content: [],
                stopReason: 'error',
                errorMessage: 'upstream 429',
              }),
            }),
          }) as never,
      }),
    ).rejects.toThrow(/upstream 429/);
  });

  it('forces temperature 0 and passes the key through to the transport', async () => {
    let seen: { temperature?: number; apiKey?: string } = {};
    const text = await callPiModel({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      apiKey: 'secret-key',
      userPrompt: 'hello',
      providerFactory: () =>
        ({
          getModels: () => [{ id: 'deepseek-chat' }],
          streamSimple: (_m: unknown, _ctx: unknown, opts: { temperature?: number; apiKey?: string }) => {
            seen = opts;
            return { result: async () => ({ content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' }) };
          },
        }) as never,
    });

    expect(text).toBe('ok');
    expect(seen.temperature).toBe(0);
    expect(seen.apiKey).toBe('secret-key');
  });
});

describe('PROTECTED INVARIANT: a retry must differ from the attempt it repairs', () => {
  const schema = z.object({ verdict: z.string() });

  it('feeds the validation error back instead of re-sending the same prompt', async () => {
    const prompts: string[] = [];
    let call = 0;

    const result = await executeStructuredModelCall(
      { role: 'grader', promptVersion: '1', systemPrompt: 's', userPrompt: 'original', schema },
      async (prompt) => {
        prompts.push(prompt);
        call += 1;
        // Wrong shape first, correct once told what was wrong.
        return call === 1 ? '[{"verdict":"approved"}]' : '{"verdict":"approved"}';
      },
    );

    expect(result).toEqual({ verdict: 'approved' });
    // At temperature 0 an unchanged prompt returns an identical response, so a
    // retry that does not carry the error is three guaranteed failures.
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe('original');
    expect(prompts[1]).not.toBe('original');
    expect(prompts[1]).toContain('did not match the required shape');
  });

  it('still gives up after three attempts', async () => {
    let calls = 0;
    await expect(
      executeStructuredModelCall(
        { role: 'grader', promptVersion: '1', systemPrompt: 's', userPrompt: 'p', schema },
        async () => {
          calls += 1;
          return '[]';
        },
      ),
    ).rejects.toThrow(/after 3 attempts/);
    expect(calls).toBe(3);
  });
});
