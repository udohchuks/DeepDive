import { runPreflight } from '@deepdive/sandbox';
import { createModelProvider, EnvironmentKeyStore, KNOWN_PROVIDERS } from '@deepdive/provider';

export interface DoctorReport {
  lines: string[];
  ok: boolean;
}

/**
 * Reports whether this machine can actually run a session, without making a
 * network call or spending anything. Sandbox availability and key resolution
 * are the two things that most often block a first run, and both fail closed,
 * so it is worth being able to check them separately from doing real work.
 */
export function buildDoctorReport(env: NodeJS.ProcessEnv = process.env): DoctorReport {
  const lines: string[] = [];
  let ok = true;

  const preflight = runPreflight();
  lines.push(`sandbox      : ${preflight.status} (${preflight.facilityName})`);
  if (!preflight.isSupported) {
    ok = false;
    lines.push(`               ${preflight.remediationText ?? 'no remediation text provided'}`);
  }

  const requested = env.MODEL_PROVIDER ?? 'anthropic';
  lines.push(`provider     : ${requested}${env.MODEL_PROVIDER ? '' : ' (default)'}`);

  try {
    const keyStore = new EnvironmentKeyStore();
    const provider = createModelProvider(env.MODEL_PROVIDER, keyStore);
    lines.push(`model        : ${(provider as { model?: string }).model ?? 'unknown'}`);

    const providerId = requested.toLowerCase() === 'claude' ? 'anthropic' : requested.toLowerCase();
    if (keyStore.getApiKey(providerId)) {
      lines.push('api key      : found');
    } else {
      ok = false;
      lines.push('api key      : MISSING — there is no unauthenticated path, so calls will fail');
    }
  } catch (err: unknown) {
    ok = false;
    lines.push(`provider     : ERROR — ${err instanceof Error ? err.message : String(err)}`);
    lines.push(`               known providers: ${KNOWN_PROVIDERS.join(', ')}`);
  }

  return { lines, ok };
}
