import fs from 'fs';
import path from 'path';

/**
 * Loads a `.env` beside the project, then the current directory.
 *
 * Without this, every command needed `node --env-file=.env …` — an incantation
 * that is easy to leave off, and whose absence shows up as "API key missing"
 * rather than as "you forgot a flag". Worse, nothing that launches the CLI for
 * you can pass it: the VS Code extension spawns the binary directly, so a key
 * that only existed inside `--env-file` was invisible to the editor.
 *
 * A variable already present in the real environment always wins. A file on
 * disk must not be able to silently redirect a command to a different provider
 * or key than the one the shell was configured with.
 */
export function loadEnvFiles(
  candidates: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  readFile: (p: string) => string | null = tryRead,
): string[] {
  const loaded: string[] = [];

  for (const candidate of candidates) {
    const contents = readFile(candidate);
    if (contents === null) continue;

    for (const [key, value] of Object.entries(parseEnv(contents))) {
      if (env[key] === undefined) env[key] = value;
    }
    loaded.push(path.resolve(candidate));
  }

  return loaded;
}

function tryRead(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * A deliberately small subset: `KEY=value`, `#` comments, optional quotes.
 *
 * Anything fancier — interpolation, multi-line values, `export` prefixes —
 * would be a second, subtly different dialect of a format people already have
 * expectations about. If a key needs more than this, the environment is the
 * right place for it.
 */
export function parseEnv(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * The nearest `.env` at or above the project directory, then the same from the
 * working directory.
 *
 * Walking upward because a project lives *inside* a checkout: a student
 * grading `./study/charter.json` keeps their key at the top of the repository,
 * not one copy in every project folder. This is the same rule `.gitignore` and
 * `.npmrc` follow, so it needs no explaining.
 *
 * Stops at the filesystem root; a `.env` in a home directory two levels up is
 * still found, which is a feature — that is where people keep one.
 */
export function envFileCandidates(projectDir: string, cwd: string): string[] {
  const found: string[] = [];

  for (const start of [projectDir, cwd]) {
    let dir = path.resolve(start);

    for (;;) {
      const candidate = path.join(dir, '.env');
      if (!found.includes(candidate)) found.push(candidate);

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return found;
}
