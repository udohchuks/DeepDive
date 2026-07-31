import { Finding } from '@deepdive/core';

/**
 * The shape `deepdive <command> --json` writes to stdout.
 *
 * Only the fields this extension actually reads are declared. The CLI is free
 * to add more, and an older CLI that omits one is handled by treating it as
 * absent rather than by failing to parse the whole result.
 */
export interface CliResult {
  command: string;
  exitCode: number;
  lines: string[];
  errors: string[];
  status?: string;
  phaseId?: string;
  rubric?: string;
  findings?: Finding[];
  rounds?: RoundSummary[];
  stats?: StudioStats;
  level?: string;
  content?: string;
  targetFieldId?: string;
  roundNumber?: number;
  freshlyGenerated?: boolean;
  revealed?: { level: string; content: string }[];
}

export interface RoundSummary {
  roundNumber: number;
  phaseId: string;
  status: string;
  submittedAt: string;
  roleId: string;
  findings: Finding[];
}

export interface StudioStats {
  rounds: number;
  approved: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  peakHour: number | null;
  hintsTaken: number;
  conceptsMastered: number;
  conceptsTracked: number;
  phasesApproved: string[];
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  code: number;
}

/** Runs a command and resolves with its output. Injected so tests need no CLI. */
export type ProcessRunner = (args: string[]) => Promise<ProcessOutput>;

export class CliNotFoundError extends Error {
  constructor(command: string) {
    super(
      `Could not run the DeepDive CLI ("${command}"). Set "deepdive.cliPath" in your settings to the built bin.js, or run "npm run build" in the DeepDive repo.`,
    );
    this.name = 'CliNotFoundError';
  }
}

export class CliOutputError extends Error {
  constructor(public readonly raw: string) {
    super(`The DeepDive CLI did not return readable JSON.\n\n${raw.slice(0, 400)}`);
    this.name = 'CliOutputError';
  }
}

/**
 * Talks to the CLI rather than reimplementing it.
 *
 * Two reasons this is a process boundary and not an import. The commands that
 * matter here either open SQLite (a native module built for Node's ABI, not
 * the Electron ABI the extension host runs) or drive a model through the pi
 * harness, and both are happier in their own process. The second reason is the
 * one that would still apply without the first: one implementation of "what
 * does grading a charter mean" is easier to keep honest than two.
 *
 * It reads `--json`, never the human output, so the CLI stays free to reword
 * its printed lines without breaking this.
 */
export class DeepDiveClient {
  constructor(private readonly run: ProcessRunner) {}

  async grade(rubric: string, artifactPath: string, projectDir: string): Promise<CliResult> {
    return this.exec(['grade', rubric, artifactPath, '--project', projectDir]);
  }

  async studio(projectDir: string): Promise<CliResult> {
    return this.exec(['studio', '--project', projectDir]);
  }

  async history(projectDir: string): Promise<CliResult> {
    return this.exec(['history', '--project', projectDir]);
  }

  async hint(projectDir: string, level?: string): Promise<CliResult> {
    return this.exec(['hint', ...(level ? [level] : []), '--project', projectDir]);
  }

  async doctor(): Promise<CliResult> {
    return this.exec(['doctor']);
  }

  /**
   * A non-zero exit is not an error here.
   *
   * `grade` exits 1 for a submission that needs revision — that is a result to
   * display, not a failure to report. Only unparseable output is a failure.
   */
  private async exec(args: string[]): Promise<CliResult> {
    const output = await this.run([...args, '--json']);
    return parseCliResult(output);
  }
}

export function parseCliResult(output: ProcessOutput): CliResult {
  const trimmed = output.stdout.trim();
  if (trimmed.length === 0) {
    throw new CliOutputError(output.stderr || '(no output)');
  }

  // The JSON object is the last line: anything the CLI or Node wrote directly
  // to stdout before it (a deprecation warning, for instance) would otherwise
  // make the whole result unparseable.
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1);

  try {
    return JSON.parse(lastLine) as CliResult;
  } catch {
    throw new CliOutputError(trimmed);
  }
}
