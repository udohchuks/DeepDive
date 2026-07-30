import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { resolveProviderCredential, describeCredentialSource } from '../src/index.js';

function authFileWith(contents: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'deepdive-auth-'));
  const file = path.join(dir, 'auth.json');
  writeFileSync(file, JSON.stringify(contents), 'utf8');
  return file;
}

describe('pi-backed credential resolution', () => {
  it('uses an explicit environment key when present', () => {
    const resolved = resolveProviderCredential('deepseek', {
      DEEPSEEK_API_KEY: 'env-key',
    } as NodeJS.ProcessEnv);

    expect(resolved.source).toBe('environment');
    expect(resolved.apiKey).toBe('env-key');
  });

  it('falls back to a pi login api key when the environment has none', () => {
    const authPath = authFileWith({ deepseek: { type: 'api_key', key: 'pi-stored-key' } });

    const resolved = resolveProviderCredential('deepseek', {} as NodeJS.ProcessEnv, authPath);

    expect(resolved.source).toBe('pi-login-api-key');
    expect(resolved.apiKey).toBe('pi-stored-key');
  });

  it('environment configuration wins over a pi login', () => {
    // A project-local .env must stay predictable, and a student must be able to
    // override a stale global login without logging out of pi.
    const authPath = authFileWith({ deepseek: { type: 'api_key', key: 'pi-stored-key' } });

    const resolved = resolveProviderCredential(
      'deepseek',
      { DEEPSEEK_API_KEY: 'env-key' } as NodeJS.ProcessEnv,
      authPath,
    );

    expect(resolved.source).toBe('environment');
    expect(resolved.apiKey).toBe('env-key');
  });

  it('reports an OAuth login as usable but keyless', () => {
    const authPath = authFileWith({
      anthropic: { type: 'oauth', access: 'a', refresh: 'r', expires: Date.now() + 60_000 },
    });

    const resolved = resolveProviderCredential('anthropic', {} as NodeJS.ProcessEnv, authPath);

    expect(resolved.source).toBe('pi-login-oauth');
    expect(resolved.oauthAvailable).toBe(true);
    // An OAuth token is not an API key; handing it over as one would fail
    // confusingly at the provider rather than here.
    expect(resolved.apiKey).toBeUndefined();
  });

  it('PROTECTED INVARIANT: a provider never reads another vendor key', () => {
    const authPath = authFileWith({ openai: { type: 'api_key', key: 'openai-key' } });

    const resolved = resolveProviderCredential(
      'deepseek',
      { OPENAI_API_KEY: 'openai-key', ANTHROPIC_API_KEY: 'anthropic-key' } as NodeJS.ProcessEnv,
      authPath,
    );

    expect(resolved.source).toBe('none');
    expect(resolved.apiKey).toBeUndefined();
  });

  it('treats CLAUDE_API_KEY as an anthropic alias only', () => {
    const anthropic = resolveProviderCredential('anthropic', {
      CLAUDE_API_KEY: 'claude-key',
    } as NodeJS.ProcessEnv);
    expect(anthropic.apiKey).toBe('claude-key');

    const deepseek = resolveProviderCredential('deepseek', {
      CLAUDE_API_KEY: 'claude-key',
    } as NodeJS.ProcessEnv);
    expect(deepseek.source).toBe('none');
  });

  it('reports no credential rather than crashing on an unreadable auth file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'deepdive-auth-'));
    const file = path.join(dir, 'auth.json');
    writeFileSync(file, 'not json at all', 'utf8');

    const resolved = resolveProviderCredential('deepseek', {} as NodeJS.ProcessEnv, file);
    expect(resolved.source).toBe('none');
  });

  it('describes each source without printing the credential', () => {
    const described = describeCredentialSource({
      source: 'pi-login-api-key',
      apiKey: 'super-secret-value',
      oauthAvailable: false,
    });

    expect(described).toContain('pi login');
    expect(described).not.toContain('super-secret-value');
  });
});
