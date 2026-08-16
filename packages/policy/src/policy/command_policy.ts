import { isPathWithin, normalizePosixPathForWindows } from './path_policy.js';

export interface CommandClassification {
  isReadOnly: boolean;
  commandName: string;
  reason?: string;
}

const READ_ONLY_COMMANDS = new Set([
  'ls',
  'dir',
  'cat',
  'grep',
  'rg',
  'find',
  'head',
  'tail',
  'wc',
  'diff',
  'pwd',
  'echo',
  'which',
  'whoami',
]);

/**
 * Read-only subcommands, keyed by the leading command.
 *
 * Values may be multi-word (`run test`). They are matched against the joined
 * tokens that follow the command, longest first, so `npm run test` resolves
 * rather than being compared against the single token `run`.
 */
const READ_ONLY_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(['status', 'log', 'diff', 'show', 'branch', 'rev-parse']),
  cargo: new Set(['check', 'test']),
  npm: new Set(['test', 'run test', 'run typecheck', 'run lint']),
};

/**
 * Characters that let one command line become several, or reach the filesystem
 * without naming a mutating command.
 *
 * Splitting on whitespace and inspecting the first token describes a single
 * command, and a shell line is not necessarily a single command. `cat f &&
 * curl evil.com` and `grep x | sh` both lead with an allowlisted read-only
 * name, and both previously classified as read-only — the allowlist was
 * answering a question about `cat` while the shell ran something else. The same
 * hole covers redirects (`>` writes), command substitution (`$(…)`, backticks)
 * and newlines.
 *
 * This is the Verifier's only bash guard and its input is chosen by a model, so
 * the check refuses to classify anything it cannot read as one command rather
 * than classifying it optimistically.
 */
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n\r]/;

export function classifyCommand(fullCommandLine: string): CommandClassification {
  const trimmed = fullCommandLine.trim();
  if (!trimmed) {
    return { isReadOnly: true, commandName: '' };
  }

  // Checked before tokenizing: the question "which command is this?" has no
  // answer for a line that is more than one command.
  //
  // A quoted metacharacter (`grep "a;b" f`) is refused too. Distinguishing it
  // would mean implementing shell quoting rules, and being wrong in that
  // direction lets a command through; being wrong in this direction only
  // rejects a command the student can rephrase.
  const metaMatch = SHELL_METACHARACTERS.exec(trimmed);
  if (metaMatch) {
    return {
      isReadOnly: false,
      commandName: pathBasename(trimmed.split(/\s+/)[0]),
      reason: `Command contains the shell metacharacter "${metaMatch[0]}", so it is more than one command and cannot be classified as read-only.`,
    };
  }

  const tokens = trimmed.split(/\s+/);
  const mainCmd = pathBasename(tokens[0]);

  if (READ_ONLY_COMMANDS.has(mainCmd)) {
    return { isReadOnly: true, commandName: mainCmd };
  }

  const subcommands = READ_ONLY_SUBCOMMANDS[mainCmd];
  if (subcommands && tokens.length > 1) {
    // Longest first, so `run test` is preferred over any single-token entry.
    for (let take = Math.min(tokens.length - 1, 3); take >= 1; take--) {
      const sub = tokens.slice(1, 1 + take).join(' ');
      if (subcommands.has(sub)) {
        return { isReadOnly: true, commandName: `${mainCmd} ${sub}` };
      }
    }
  }

  // Framework test runners
  if (['vitest', 'jest', 'pytest'].includes(mainCmd)) {
    return { isReadOnly: true, commandName: mainCmd };
  }

  return {
    isReadOnly: false,
    commandName: mainCmd,
    reason: `Command "${mainCmd}" is classified as mutating / potentially modifying.`,
  };
}

function pathBasename(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1].toLowerCase();
}

export interface ScaffolderCommandOptions {
  /** Absolute path of the only directory mutating commands may affect. */
  workspaceRoot: string;
  /** Graded artifact names/paths the Scaffolder must never touch (P-2). */
  gradedArtifacts: string[];
  /** Override for tests; defaults to the real platform. */
  platform?: NodeJS.Platform;
}

export interface ScaffolderCommandCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Shell operators that turn file writing into a string the tool-call hook
 * otherwise cannot see as a path argument. Redirection (`>`, `>>`, `<`,
 * heredocs), command substitution (`$(…)`, backticks) — every one is a way to
 * produce a file while naming no path the checks below could inspect.
 */
const REDIRECT_OR_SUBSTITUTION = /[<>`]|\$\(/;

/** Operators that chain several commands into one line. */
const CHAIN_SPLIT = /\|\||&&|;|\||\r?\n/;

/** A token that names a location rather than a flag or a bare word. */
function isPathLikeToken(token: string): boolean {
  return token.startsWith('/') || token.startsWith('\\') || token.startsWith('~') ||
    /^[a-zA-Z]:[\\/]/.test(token);
}

/**
 * Gate for the Scaffolder's bash tool.
 *
 * Unlike the Verifier (which may only run read-only commands), the Scaffolder
 * legitimately mutates: it installs dependencies, creates directories, runs
 * builds. What it must never do is mutate *outside* the workspace, or touch a
 * graded artifact — the student's design document — by any route. The write
 * and edit tools are policy-checked, so the hole this closes is bash: a model
 * that is told "no" by the write tool will reach for `echo … > sdd.json`,
 * which no path check on tool arguments ever sees.
 *
 * The stance is the one classifyCommand already takes for the Verifier: when a
 * construct cannot be read reliably, it is refused rather than guessed at.
 * Redirection and substitution are refused outright — the write tool is the
 * intended way to create files, and it is fully checked. Chained lines are
 * split and every segment must pass on its own. Relative paths are allowed
 * because the session cwd *is* the workspace; absolute and home-relative
 * paths are held to the workspace boundary, and a graded artifact name in a
 * mutating segment is refused even buried inside a longer argument.
 */
export function checkScaffolderCommand(
  fullCommandLine: string,
  options: ScaffolderCommandOptions,
): ScaffolderCommandCheck {
  const trimmed = fullCommandLine.trim();
  if (!trimmed) return { allowed: true };

  if (REDIRECT_OR_SUBSTITUTION.test(trimmed)) {
    return {
      allowed: false,
      reason:
        `Shell redirection or substitution is not available to the Scaffolder; ` +
        `create and modify files with the write and edit tools instead: "${trimmed}"`,
    };
  }

  const gradedLower = options.gradedArtifacts.map((g) => g.toLowerCase());

  for (const rawSegment of trimmed.split(CHAIN_SPLIT)) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const classification = classifyCommand(segment);
    if (classification.isReadOnly) continue;

    const tokens = segment.split(/\s+/).slice(1); // command name itself is never a path argument

    for (const token of tokens) {
      const tokenLower = token.toLowerCase();

      for (const graded of gradedLower) {
        if (tokenLower.includes(graded)) {
          return {
            allowed: false,
            reason:
              `PROTECTED INVARIANT P-2: Scaffolder bash command names a graded artifact ` +
              `("${graded}") in a mutating command: "${segment}"`,
          };
        }
      }

      if (token.startsWith('~')) {
        return {
          allowed: false,
          reason: `Home-relative paths cannot be verified against the workspace: "${token}"`,
        };
      }

      if (isPathLikeToken(token)) {
        const normalized = normalizePosixPathForWindows(token, { platform: options.platform });
        if (!isPathWithin(options.workspaceRoot, normalized)) {
          return {
            allowed: false,
            reason: `Command targets a path outside the workspace boundary: "${token}"`,
          };
        }
      }
    }
  }

  return { allowed: true };
}
