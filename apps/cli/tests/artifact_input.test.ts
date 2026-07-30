import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertWorkspace, loadArtifact } from '../src/artifact_input.js';
import { parseProjectDir } from '../src/cli.js';
import { NoProjectHistoryError, SessionStore } from '../src/session_store.js';

const created: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepdive-edge-'));
  created.push(dir);
  return dir;
}

function write(name: string, content: string): string {
  const file = path.join(tempDir(), name);
  fs.writeFileSync(file, content);
  return file;
}

afterEach(() => {
  while (created.length) fs.rmSync(created.pop()!, { recursive: true, force: true });
});

describe('a bad artifact is reported as itself', () => {
  it('names a missing file rather than surfacing ENOENT', async () => {
    await expect(loadArtifact(path.join(tempDir(), 'nope.json'))).rejects.toThrow(/No such file/);
  });

  it('says so when handed a directory', async () => {
    await expect(loadArtifact(tempDir())).rejects.toThrow(/is a directory/);
  });

  it('says so when the file is empty', async () => {
    await expect(loadArtifact(write('empty.json', '  '))).rejects.toThrow(/is empty/);
  });

  it('names the file when JSON is malformed', async () => {
    await expect(loadArtifact(write('bad.json', '{ oops'))).rejects.toThrow(/is not valid JSON/);
  });

  it('rejects a JSON array before the rubric sees it', async () => {
    // Otherwise the gate reports "your charter has no title" for something
    // that is not a charter at all, sending the student to fix the wrong thing.
    await expect(loadArtifact(write('arr.json', '[1,2]'))).rejects.toThrow(/must contain a JSON object/);
  });

  it('rejects a bare null', async () => {
    await expect(loadArtifact(write('null.json', 'null'))).rejects.toThrow(/must contain a JSON object/);
  });

  it('accepts an ordinary object', async () => {
    await expect(loadArtifact(write('ok.json', '{"title":"x"}'))).resolves.toEqual({ title: 'x' });
  });
});

describe('a bad workspace is caught before anything is spent', () => {
  it('rejects a path that does not exist', () => {
    // This used to fail with "API key missing" instead, because the model was
    // built before the path was ever checked.
    expect(() => assertWorkspace(path.join(tempDir(), 'nowhere'))).toThrow(/No such workspace/);
  });

  it('rejects a file used as a workspace', () => {
    expect(() => assertWorkspace(write('a.txt', 'x'))).toThrow(/is a file/);
  });
});

describe('--project must name a directory', () => {
  it('refuses a trailing --project with no value', () => {
    // Falling back to the current directory would write one project's history
    // into another, and only show up much later as an empty history.
    expect(() => parseProjectDir(['history', '--project'])).toThrow(/needs a directory/);
  });

  it('refuses --project followed by another flag', () => {
    expect(() => parseProjectDir(['grade', '--project', '--auto'])).toThrow(/needs a directory/);
  });

  it('accepts a normal value', () => {
    expect(parseProjectDir(['history', '--project', '/p']).projectDir).toBe('/p');
  });
});

describe('PROTECTED INVARIANT: reading a project does not create one', () => {
  it('refuses rather than creating a database when mustExist is set', () => {
    const dir = tempDir();

    expect(() => new SessionStore({ projectDir: dir, mustExist: true })).toThrow(
      NoProjectHistoryError,
    );
    // Looking at a project must not mark the filesystem, and a typo'd
    // --project must not silently create a second, empty project.
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('still opens an existing project', () => {
    const dir = tempDir();
    new SessionStore({ projectDir: dir }).close();

    const reopened = new SessionStore({ projectDir: dir, mustExist: true });
    expect(reopened.history()).toEqual([]);
    reopened.close();
  });
});
