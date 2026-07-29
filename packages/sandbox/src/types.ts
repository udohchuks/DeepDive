export interface MountPolicy {
  readOnlyPaths: string[];
  readWritePaths: string[];
  blockedPaths: string[];
}

export interface SandboxExecutionOptions {
  cwd: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  mountPolicy: MountPolicy;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SandboxWrapper {
  execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult>;
}
