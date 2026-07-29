import { ModelProvider, ModelRequestOptions } from '@deepdive/core';
import { KeyStore, EnvironmentKeyStore } from './key_store.js';
import { executeStructuredModelCall, MissingApiKeyError } from './call.js';

export class AnthropicModelProvider implements ModelProvider {
  constructor(private keyStore: KeyStore = new EnvironmentKeyStore()) {}

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const apiKey = this.keyStore.getApiKey('anthropic');
    if (!apiKey) {
      throw new MissingApiKeyError('anthropic');
    }

    return executeStructuredModelCall(options, async (prompt, _temp) => {
      // Mocked underlying SDK call representation for BYO API Key provider wrapper
      return prompt;
    });
  }
}
