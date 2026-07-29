import { ModelProvider, ModelRequestOptions } from '@deepdive/core';
import { KeyStore, EnvironmentKeyStore } from './key_store.js';
import {
  executeStructuredModelCall,
  MissingApiKeyError,
  assertPinnedModel,
  PINNED_CLAUDE_MODEL,
  PINNED_DEEPSEEK_MODEL,
  PINNED_OPENROUTER_MODEL,
} from './call.js';
import { callPiModel, PiProviderId } from './pi_ai_client.js';

/**
 * Shared base for every real (network-backed) provider.
 *
 * The key is resolved once per call and a missing key is a hard
 * MissingApiKeyError — there is no unauthenticated path, no ambient credential
 * lookup, and no silent no-op. Temperature is forced to 0 and the model id is
 * pinned at construction (D-2, D-5).
 */
abstract class PiBackedModelProvider implements ModelProvider {
  readonly model: string;
  readonly baseUrl?: string;

  protected constructor(
    protected readonly providerId: PiProviderId,
    protected readonly keyStore: KeyStore,
    model: string,
    baseUrl?: string,
  ) {
    this.model = assertPinnedModel(model);
    this.baseUrl = baseUrl;
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey(this.providerId);
    if (!apiKey) {
      throw new MissingApiKeyError(this.providerId);
    }

    return executeStructuredModelCall(options, async (prompt, temperature) =>
      callPiModel({
        providerId: this.providerId,
        modelId: this.model,
        apiKey,
        systemPrompt: options.systemPrompt,
        userPrompt: prompt,
        temperature,
      }),
    );
  }
}

export class AnthropicModelProvider extends PiBackedModelProvider {
  constructor(keyStore: KeyStore = new EnvironmentKeyStore(), options?: { model?: string }) {
    super('anthropic', keyStore, options?.model ?? process.env.ANTHROPIC_MODEL ?? PINNED_CLAUDE_MODEL);
  }
}

export class DeepSeekModelProvider extends PiBackedModelProvider {
  constructor(keyStore: KeyStore = new EnvironmentKeyStore(), options?: { model?: string; baseUrl?: string }) {
    super(
      'deepseek',
      keyStore,
      options?.model ?? process.env.DEEPSEEK_MODEL ?? PINNED_DEEPSEEK_MODEL,
      options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    );
  }
}

/**
 * OpenRouter routes to many upstream vendors behind one API. Model slugs are
 * vendor-qualified (e.g. "anthropic/claude-3.5-sonnet") and pinned like any
 * other, since routing to a moving alias would change the grader between a
 * student's submissions.
 */
export class OpenRouterModelProvider extends PiBackedModelProvider {
  constructor(keyStore: KeyStore = new EnvironmentKeyStore(), options?: { model?: string; baseUrl?: string }) {
    super(
      'openrouter',
      keyStore,
      options?.model ?? process.env.OPENROUTER_MODEL ?? PINNED_OPENROUTER_MODEL,
      options?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    );
  }
}

export class OpenAiModelProvider extends PiBackedModelProvider {
  constructor(keyStore: KeyStore = new EnvironmentKeyStore(), options?: { model?: string }) {
    super('openai', keyStore, options?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-2024-11-20');
  }
}

export class UnsupportedProviderError extends Error {
  constructor(name: string, known: readonly string[]) {
    super(
      `No AI provider is configured for "${name}". Set MODEL_PROVIDER to one of: ${known.join(', ')}, and supply that provider's API key.`,
    );
    this.name = 'UnsupportedProviderError';
  }
}

export const KNOWN_PROVIDERS = ['anthropic', 'deepseek', 'openrouter', 'openai'] as const;

/**
 * Resolves the configured provider.
 *
 * An unrecognized MODEL_PROVIDER throws rather than falling back to a generic
 * stub: a misconfigured grader must fail loudly at startup, not silently return
 * unusable verdicts.
 */
export function createModelProvider(
  providerType?: string,
  keyStore: KeyStore = new EnvironmentKeyStore(),
): ModelProvider {
  const provider = (providerType ?? process.env.MODEL_PROVIDER ?? 'anthropic').toLowerCase();

  switch (provider) {
    case 'anthropic':
    case 'claude':
      return new AnthropicModelProvider(keyStore);
    case 'deepseek':
      return new DeepSeekModelProvider(keyStore);
    case 'openrouter':
      return new OpenRouterModelProvider(keyStore);
    case 'openai':
      return new OpenAiModelProvider(keyStore);
    default:
      throw new UnsupportedProviderError(provider, KNOWN_PROVIDERS);
  }
}
