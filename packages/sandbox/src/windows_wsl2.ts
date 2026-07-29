import { SandboxWrapper, SandboxExecutionOptions, SandboxExecutionResult, MountPolicy } from './types.js';
import { buildBubblewrapArgs } from './linux_bubblewrap.js';
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
 * Translates a Windows path into the path WSL2 sees for it.
 *
 *   C:\Users\me\work  ->  /mnt/c/Users/me/work
 *   /already/posix    ->  /already/posix (unchanged)
 *
 * Paths that cannot be expressed inside the WSL2 filesystem (UNC shares,
 * relative paths) are rejected rather than guessed at: a mount policy that
 * silently loses a path would grant or deny the wrong thing.
 */
export function toWslPath(windowsPath: string): string {
  if (windowsPath.startsWith('/')) {
    return windowsPath;
  }

  const driveMatch = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2].replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
    return rest ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
  }

  if (/^\\\\/.test(windowsPath)) {
    throw new Error(`Cannot sandbox a UNC path under WSL2: "${windowsPath}". Use a local drive path.`);
  }

  throw new Error(
    `Cannot translate "${windowsPath}" to a WSL2 path. Provide an absolute Windows path (C:\\...) or a POSIX path.`,
  );
}

function translatePolicy(policy: MountPolicy): MountPolicy {
  return {
    readOnlyPaths: policy.readOnlyPaths.map(toWslPath),
    readWritePaths: policy.readWritePaths.map(toWslPath),
    blockedPaths: policy.blockedPaths.map(toWslPath),
  };
}

/**
 * Builds the wsl.exe argument vector.
 *
 * WSL2 is a real Linux kernel, so the mount policy is enforced by bubblewrap
 * *inside* the VM using exactly the same argument construction as the native
 * Linux wrapper. WSL2 alone is a VM boundary, not a path-level policy — running
 * bwrap within it is what makes readOnly/readWrite/blocked mean the same thing
 * on Windows as on Linux.
 */
export function buildWsl2Args(options: SandboxExecutionOptions): string[] {
  const bwrapArgs = buildBubblewrapArgs({
    ...options,
    cwd: toWslPath(options.cwd),
    mountPolicy: translatePolicy(options.mountPolicy),
  });

  return ['--exec', 'bwrap', ...bwrapArgs];
}

export class WindowsWsl2Wrapper implements SandboxWrapper {
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    let wslArgs: string[];
    try {
      wslArgs = buildWsl2Args(options);
    } catch (err) {
      // Path translation failure must not fall through to an unsandboxed run.
      return {
        exitCode: 1,
        stdout: '',
        stderr: (err as Error).message,
        timedOut: false,
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync('wsl.exe', wslArgs, {
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
