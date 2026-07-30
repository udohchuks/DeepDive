import { readStoredCredential } from '@earendil-works/pi-coding-agent';

/**
 * Where a provider credential came from. Reported to the user so a surprising
 * auth outcome can be traced without printing the credential itself.
 */
export type CredentialSource = 'environment' | 'pi-login-api-key' | 'pi-login-oauth' | 'none';

export interface ResolvedCredential {
  source: CredentialSource;
  /** Present for api-key credentials only. OAuth tokens are not API keys. */
  apiKey?: string;
  /**
   * True when pi holds an OAuth login for this provider. Sessions running on
   * pi's ModelRuntime can use it; a direct pi-ai call cannot, because it takes
   * an apiKey rather than a refreshable token.
   */
  oauthAvailable: boolean;
}

/** Env var each provider reads. Mirrors pi's own per-provider scoping. */
const PROVIDER_ENV_VARS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  openai: ['OPENAI_API_KEY'],
};

/**
 * Resolves a provider credential from the environment, then from pi's own
 * login store.
 *
 * Adopting pi's credential store is what makes `pi login` work for DeepDive:
 * a student who has authenticated pi once — including via Anthropic OAuth,
 * i.e. a Claude subscription rather than an API key — does not have to create
 * a .env file at all.
 *
 * Explicit environment configuration still wins, so a project-local .env stays
 * predictable and a student can override a stale global login without logging
 * out of pi.
 *
 * Each provider reads only its own variables. pi enforces the same scoping
 * internally, so no credential is ever offered to an endpoint it was not
 * issued for.
 */
export function resolveProviderCredential(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
  authPath?: string,
): ResolvedCredential {
  const id = providerId.toLowerCase() === 'claude' ? 'anthropic' : providerId.toLowerCase();

  for (const varName of PROVIDER_ENV_VARS[id] ?? [`${id.toUpperCase()}_API_KEY`]) {
    const value = env[varName];
    if (value) {
      return { source: 'environment', apiKey: value, oauthAvailable: false };
    }
  }

  let stored;
  try {
    stored = readStoredCredential(id, authPath);
  } catch {
    // A malformed or unreadable auth.json must not crash configuration
    // reporting; it is reported as "no credential" like any other miss.
    return { source: 'none', oauthAvailable: false };
  }

  if (stored?.type === 'api_key' && stored.key) {
    return { source: 'pi-login-api-key', apiKey: stored.key, oauthAvailable: false };
  }

  if (stored?.type === 'oauth') {
    return { source: 'pi-login-oauth', oauthAvailable: true };
  }

  return { source: 'none', oauthAvailable: false };
}

/** Human-readable explanation of a credential source, for `doctor`. */
export function describeCredentialSource(resolved: ResolvedCredential): string {
  switch (resolved.source) {
    case 'environment':
      return 'found (environment)';
    case 'pi-login-api-key':
      return 'found (pi login, api key)';
    case 'pi-login-oauth':
      return 'found (pi login, OAuth) — usable by scaffold/verify';
    case 'none':
      return 'MISSING — run "pi login", or set the provider key in .env';
  }
}
