import { describe, it, expect } from 'vitest';
import path from 'path';
import { envFileCandidates, loadEnvFiles, parseEnv } from '../src/env_file.js';

describe('parsing a .env', () => {
  it('reads plain assignments', () => {
    expect(parseEnv('MODEL_PROVIDER=deepseek\nKEY=abc')).toEqual({
      MODEL_PROVIDER: 'deepseek',
      KEY: 'abc',
    });
  });

  it('ignores comments and blank lines', () => {
    expect(parseEnv('# a comment\n\nKEY=v\n')).toEqual({ KEY: 'v' });
  });

  it('strips the outer quotes and keeps inner ones', () => {
    expect(parseEnv('A="v"\nB=\'v\'\nC="a"b"')).toEqual({ A: 'v', B: 'v', C: 'a"b' });
  });

  it('leaves an unbalanced quote alone rather than guessing', () => {
    expect(parseEnv('A="unclosed')).toEqual({ A: '"unclosed' });
  });

  it('keeps everything after the first equals, since keys can contain values with =', () => {
    expect(parseEnv('TOKEN=abc=def==')).toEqual({ TOKEN: 'abc=def==' });
  });

  it('skips a line with no key', () => {
    expect(parseEnv('=novalue\nGOOD=y')).toEqual({ GOOD: 'y' });
  });
});

describe('loading a .env', () => {
  const NEAR = path.resolve(path.sep, 'repo', 'project', '.env');
  const FAR = path.resolve(path.sep, 'repo', '.env');
  const files: Record<string, string> = {
    [NEAR]: 'FROM_PROJECT=yes\nSHARED=project',
    [FAR]: 'FROM_ROOT=yes\nSHARED=root',
  };
  const read = (p: string) => files[p] ?? null;

  it('fills variables that are not already set', () => {
    const env: NodeJS.ProcessEnv = {};
    loadEnvFiles([NEAR], env, read);
    expect(env.FROM_PROJECT).toBe('yes');
  });

  it('PROTECTED: never overrides a variable already in the environment', () => {
    // A file on disk must not be able to silently redirect a command to a
    // different provider or key than the shell was configured with.
    const env: NodeJS.ProcessEnv = { SHARED: 'from the shell' };
    loadEnvFiles([NEAR], env, read);
    expect(env.SHARED).toBe('from the shell');
  });

  it('lets the nearest file win when several are found', () => {
    const env: NodeJS.ProcessEnv = {};
    loadEnvFiles([NEAR, FAR], env, read);
    expect(env.SHARED).toBe('project');
    expect(env.FROM_ROOT).toBe('yes');
  });

  it('reports only the files that existed', () => {
    const loaded = loadEnvFiles([path.resolve(path.sep, 'nope', '.env'), NEAR], {}, read);
    expect(loaded).toEqual([NEAR]);
  });

  it('treats an unreadable file as absent rather than failing the command', () => {
    expect(() => loadEnvFiles([NEAR], {}, () => null)).not.toThrow();
  });
});

describe('where it looks', () => {
  it('walks upward, so a key at the top of a checkout covers a project inside it', () => {
    const study = path.resolve(path.sep, 'repo', 'study');
    const candidates = envFileCandidates(study, path.resolve(path.sep));

    expect(candidates[0]).toBe(path.join(study, '.env'));
    expect(candidates).toContain(path.resolve(path.sep, 'repo', '.env'));
  });

  it('checks the project before the working directory', () => {
    const project = path.resolve(path.sep, 'a', 'project');
    const elsewhere = path.resolve(path.sep, 'b', 'elsewhere');
    const candidates = envFileCandidates(project, elsewhere);

    expect(candidates.indexOf(path.join(project, '.env'))).toBeLessThan(
      candidates.indexOf(path.join(elsewhere, '.env')),
    );
  });

  it('terminates at the filesystem root', () => {
    const root = path.resolve(path.sep);
    expect(envFileCandidates(root, root)).toEqual([path.join(root, '.env')]);
  });
});
