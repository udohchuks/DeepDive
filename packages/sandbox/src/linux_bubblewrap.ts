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

export class LinuxBubblewrapWrapper implements SandboxWrapper {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const bwrapArgs: string[] = ['--unshare-all', '--proc', '/proc', '--dev', '/dev'];

    for (const ro of options.mountPolicy.readOnlyPaths) {
      bwrapArgs.push('--ro-bind', ro, ro);
    }
    for (const rw of options.mountPolicy.readWritePaths) {
      bwrapArgs.push('--bind', rw, rw);
    }

    bwrapArgs.push('--chdir', options.cwd);
    bwrapArgs.push(options.command, ...options.args);

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
