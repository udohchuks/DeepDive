export interface KeyStore {
  getApiKey(providerName?: string): string | null;
}

/**
 * Resolves a provider's API key from the environment.
 *
 * Each provider reads only its own key. There is deliberately no cross-provider
 * fallback: falling back to another vendor's key would transmit that credential
 * to an endpoint it was never issued for. A missing key must surface as
 * MissingApiKeyError, not be silently substituted.
 */
export class EnvironmentKeyStore implements KeyStore {
  getApiKey(providerName = 'anthropic'): string | null {
    const name = providerName.toLowerCase();

    if (name === 'anthropic' || name === 'claude') {
      // CLAUDE_API_KEY is an accepted alias for the same Anthropic credential.
      return process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? null;
    }
    if (name === 'deepseek') {
      return process.env.DEEPSEEK_API_KEY ?? null;
    }
    if (name === 'openrouter') {
      return process.env.OPENROUTER_API_KEY ?? null;
    }
    if (name === 'openai') {
      return process.env.OPENAI_API_KEY ?? null;
    }

    return process.env[`${name.toUpperCase()}_API_KEY`] ?? null;
  }
}
