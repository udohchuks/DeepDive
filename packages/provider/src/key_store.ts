export interface KeyStore {
  getApiKey(providerName?: string): string | null;
}

export class EnvironmentKeyStore implements KeyStore {
  getApiKey(providerName = 'anthropic'): string | null {
    if (providerName === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? null;
    }
    return process.env[`${providerName.toUpperCase()}_API_KEY`] ?? null;
  }
}
