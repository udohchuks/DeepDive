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

const READ_ONLY_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(['status', 'log', 'diff', 'show', 'branch', 'rev-parse']),
  cargo: new Set(['check', 'test']),
  npm: new Set(['test', 'run test', 'run typecheck', 'run lint']),
};

export function classifyCommand(fullCommandLine: string): CommandClassification {
  const trimmed = fullCommandLine.trim();
  if (!trimmed) {
    return { isReadOnly: true, commandName: '' };
  }

  const tokens = trimmed.split(/\s+/);
  const mainCmd = pathBasename(tokens[0]);

  if (READ_ONLY_COMMANDS.has(mainCmd)) {
    return { isReadOnly: true, commandName: mainCmd };
  }

  const subcommands = READ_ONLY_SUBCOMMANDS[mainCmd];
  if (subcommands && tokens.length > 1) {
    const sub = tokens[1];
    if (subcommands.has(sub)) {
      return { isReadOnly: true, commandName: `${mainCmd} ${sub}` };
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
