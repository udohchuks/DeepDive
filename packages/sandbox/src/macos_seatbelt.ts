import { SandboxWrapper, SandboxExecutionOptions, SandboxExecutionResult, MountPolicy } from './types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ExecFileError extends Error {
  code?: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: string;
}

/** System paths a process needs merely to load and run a binary. */
const SYSTEM_READ_PATHS = ['/usr/lib', '/usr/bin', '/bin', '/System', '/private/var/select', '/dev/null'];

/** Escapes a path for inclusion in an SBPL double-quoted string literal. */
function sbplQuote(path: string): string {
  return `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Builds a deny-by-default Seatbelt profile from a mount policy.
 *
 * Deny-by-default is the whole point: an empty policy must grant nothing beyond
 * the system paths required to exec a binary. Blocked paths are emitted last so
 * they override any overlapping read/write grant above them.
 */
export function buildSeatbeltProfile(mountPolicy: MountPolicy): string {
  const lines: string[] = [
    '(version 1)',
    '(deny default)',
    '(allow process-exec)',
    '(allow process-fork)',
    '(allow sysctl-read)',
    '(deny network*)',
  ];

  for (const p of SYSTEM_READ_PATHS) {
    lines.push(`(allow file-read* (subpath ${sbplQuote(p)}))`);
  }
  for (const ro of mountPolicy.readOnlyPaths) {
    lines.push(`(allow file-read* (subpath ${sbplQuote(ro)}))`);
  }
  for (const rw of mountPolicy.readWritePaths) {
    lines.push(`(allow file-read* file-write* (subpath ${sbplQuote(rw)}))`);
  }
  for (const blocked of mountPolicy.blockedPaths) {
    lines.push(`(deny file-read* file-write* (subpath ${sbplQuote(blocked)}))`);
  }

  return lines.join('\n');
}

export class MacosSeatbeltWrapper implements SandboxWrapper {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const profile = buildSeatbeltProfile(options.mountPolicy);
    try {
      const { stdout, stderr } = await execFileAsync('sandbox-exec', ['-p', profile, options.command, ...options.args], {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 30000,
        env: options.env ?? process.env,
      });
      return { exitCode: 0, stdout, stderr, timedOut: false };
    } catch (err) {
      const execErr = err as ExecFileError;
      return {
        exitCode: execErr.code ?? 1,
        stdout: execErr.stdout ?? '',
        stderr: execErr.stderr ?? execErr.message ?? '',
        timedOut: Boolean(execErr.killed && execErr.signal === 'SIGTERM'),
      };
    }
  }
}
