import { SandboxWrapper, SandboxExecutionOptions, SandboxExecutionResult } from './types.js';
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

/**
 * Builds the bubblewrap argument vector for a sandboxed execution.
 *
 * Nothing is visible inside the sandbox unless it is explicitly bound, so an
 * empty mount policy grants no filesystem access at all. Blocked paths are
 * masked with a tmpfs last, so they override any overlapping bind above them.
 */
export function buildBubblewrapArgs(options: SandboxExecutionOptions): string[] {
  const bwrapArgs: string[] = ['--unshare-all', '--die-with-parent', '--proc', '/proc', '--dev', '/dev'];

  for (const ro of options.mountPolicy.readOnlyPaths) {
    bwrapArgs.push('--ro-bind', ro, ro);
  }
  for (const rw of options.mountPolicy.readWritePaths) {
    bwrapArgs.push('--bind', rw, rw);
  }
  for (const blocked of options.mountPolicy.blockedPaths) {
    bwrapArgs.push('--tmpfs', blocked);
  }

  bwrapArgs.push('--chdir', options.cwd);
  bwrapArgs.push('--', options.command, ...options.args);

  return bwrapArgs;
}

export class LinuxBubblewrapWrapper implements SandboxWrapper {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const bwrapArgs = buildBubblewrapArgs(options);

    try {
      const { stdout, stderr } = await execFileAsync('bwrap', bwrapArgs, {
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
