import { runPreflight } from '@deepdive/sandbox';
import { createModelProvider, KNOWN_PROVIDERS } from '@deepdive/provider';
import { describeCredentialSource, resolveProviderCredential } from '@deepdive/agent';

export interface DoctorReport {
  lines: string[];
  ok: boolean;
}

/**
 * Reports whether this machine can actually run a session, without making a
 * network call or spending anything. Sandbox availability and credential
 * resolution are the two things that most often block a first run, and both
 * fail closed, so it is worth being able to check them separately from doing
 * real work.
 *
 * The credential *source* is reported (environment vs `pi login`) because with
 * two possible sources, "found" alone is not enough to explain a surprising
 * result. The credential itself is never printed.
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
    const provider = createModelProvider(env.MODEL_PROVIDER) as { model?: string };
    lines.push(`model        : ${provider.model ?? 'unknown'}`);

    const credential = resolveProviderCredential(requested, env);
    lines.push(`credential   : ${describeCredentialSource(credential)}`);

    if (credential.source === 'none') {
      ok = false;
    } else if (credential.source === 'pi-login-oauth') {
      // The Grader issues a direct pi-ai call, which takes an API key rather
      // than a refreshable token, so an OAuth-only login cannot drive it.
      lines.push('               note: `grade` needs an API key; OAuth drives scaffold/verify only');
    }
  } catch (err: unknown) {
    ok = false;
    lines.push(`provider     : ERROR — ${err instanceof Error ? err.message : String(err)}`);
    lines.push(`               known providers: ${KNOWN_PROVIDERS.join(', ')}`);
  }

  return { lines, ok };
}
