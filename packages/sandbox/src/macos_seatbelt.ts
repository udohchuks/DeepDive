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

export class MacosSeatbeltWrapper implements SandboxWrapper {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const profile = '(version 1) (allow default)';
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
