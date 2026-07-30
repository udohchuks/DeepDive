import fs from 'fs';
import path from 'path';
import { readFile } from 'fs/promises';

/**
 * Reads a submitted artifact, failing with something a student can act on.
 *
 * Node's own errors surface here as `ENOENT: no such file or directory, open
 * '<path>'` or `Expected property name or '}' in JSON at position 2`, which
 * name the problem in terms of the runtime rather than the task. Since this is
 * the first thing every `grade` does, a bad message here is the first thing a
 * student sees.
 */
export async function loadArtifact(artifactPath: string): Promise<Record<string, unknown>> {
  const resolved = path.resolve(artifactPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`No such file: ${resolved}`);
  }
  if (fs.statSync(resolved).isDirectory()) {
    throw new Error(`${resolved} is a directory. Point at the .json file itself.`);
  }

  const raw = await readFile(resolved, 'utf8');
  if (raw.trim().length === 0) {
    throw new Error(`${resolved} is empty.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${resolved} is not valid JSON: ${detail}`);
  }

  // An array or a bare value would otherwise reach the deterministic gate and
  // be reported as a rubric failure — "your charter has no title" for something
  // that is not a charter at all, which sends the student to fix the wrong thing.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `${resolved} must contain a JSON object (a { ... } with named fields), not ${
        Array.isArray(parsed) ? 'an array' : typeof parsed
      }.`,
    );
  }

  return parsed as Record<string, unknown>;
}

/** Rejects a workspace path before anything expensive happens. */
export function assertWorkspace(workspace: string): string {
  const resolved = path.resolve(workspace);

  if (!fs.existsSync(resolved)) {
    throw new Error(`No such workspace: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`${resolved} is a file, not a workspace directory.`);
  }

  return resolved;
}
