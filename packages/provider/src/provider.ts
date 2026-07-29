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

export class AnthropicModelProvider implements ModelProvider {
  readonly model: string;

  constructor(
    private keyStore: KeyStore = new EnvironmentKeyStore(),
    options?: { model?: string },
  ) {
    this.model = assertPinnedModel(options?.model ?? process.env.ANTHROPIC_MODEL ?? PINNED_CLAUDE_MODEL);
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey('anthropic');
    if (!apiKey) {
      throw new MissingApiKeyError('anthropic');
    }

    return executeStructuredModelCall(options, async (prompt, _temp) => {
      // Underlying SDK/API call representation for Anthropic
      return prompt;
    });
  }
}

export class DeepSeekModelProvider implements ModelProvider {
  readonly model: string;
  readonly baseUrl: string;

  constructor(
    private keyStore: KeyStore = new EnvironmentKeyStore(),
    options?: { model?: string; baseUrl?: string },
  ) {
    this.model = assertPinnedModel(options?.model ?? process.env.DEEPSEEK_MODEL ?? PINNED_DEEPSEEK_MODEL);
    this.baseUrl = options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey('deepseek');
    if (!apiKey) {
      throw new MissingApiKeyError('deepseek');
    }

    return executeStructuredModelCall(options, async (prompt, _temp) => {
      // Underlying OpenAI-compatible API call representation for DeepSeek (this.baseUrl, this.model)
      return prompt;
    });
  }
}

/**
 * OpenRouter routes to many upstream vendors behind one OpenAI-compatible API.
 *
 * The model slug is vendor-qualified (e.g. "anthropic/claude-3.5-sonnet") and is
 * pinned like any other, since routing to a moving alias would change the grader
 * between submissions.
 */
export class OpenRouterModelProvider implements ModelProvider {
  readonly model: string;
  readonly baseUrl: string;

  constructor(
    private keyStore: KeyStore = new EnvironmentKeyStore(),
    options?: { model?: string; baseUrl?: string },
  ) {
    this.model = assertPinnedModel(options?.model ?? process.env.OPENROUTER_MODEL ?? PINNED_OPENROUTER_MODEL);
    this.baseUrl = options?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey('openrouter');
    if (!apiKey) {
      throw new MissingApiKeyError('openrouter');
    }

    return executeStructuredModelCall(options, async (prompt, _temp) => {
      // Underlying OpenAI-compatible API call representation for OpenRouter (this.baseUrl, this.model)
      return prompt;
    });
  }
}

export class GenericModelProvider implements ModelProvider {
  constructor(
    private providerName: string = 'generic',
    private keyStore: KeyStore = new EnvironmentKeyStore(),
  ) {}

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey(this.providerName);
    if (!apiKey) {
      throw new MissingApiKeyError(this.providerName);
    }

    return executeStructuredModelCall(options, async (prompt, _temp) => {
      return prompt;
    });
  }
}

export const KNOWN_PROVIDERS = ['anthropic', 'claude', 'deepseek', 'openrouter'] as const;

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
    default:
      return new GenericModelProvider(provider, keyStore);
  }
}
