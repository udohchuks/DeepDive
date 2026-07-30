import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PackageJson {
  name: string;
  private?: boolean;
  main?: string;
  files?: string[];
  engines?: Record<string, string>;
  publishConfig?: { access?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function workspacePackages(): { dir: string; json: PackageJson }[] {
  const dirs = ['packages', 'apps'].flatMap((group) =>
    fs
      .readdirSync(path.join(repoRoot, group))
      .map((name) => path.join(group, name))
      .filter((rel) => fs.existsSync(path.join(repoRoot, rel, 'package.json'))),
  );

  return dirs.map((dir) => ({
    dir,
    json: JSON.parse(
      fs.readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'),
    ) as PackageJson,
  }));
}

const publishable = workspacePackages().filter(({ json }) => !json.private);

describe('publishable packages', () => {
  it('finds the publishable set rather than silently testing nothing', () => {
    expect(publishable.length).toBeGreaterThan(5);
  });

  it.each(publishable)('$json.name declares which files ship', ({ json }) => {
    // Without `files`, npm ships the whole working tree — including any local
    // .env or .deepdive database sitting in the package directory.
    expect(json.files).toBeDefined();
    expect(json.files).toContain('dist');
  });

  it.each(publishable)('$json.name pins the Node it was verified against', ({ json }) => {
    expect(json.engines?.node).toBeDefined();
  });

  it.each(publishable)('$json.name publishes publicly rather than failing on a scope', ({ json }) => {
    // Scoped packages default to `restricted`, so a first publish of
    // @deepdive/* fails on a free account without this.
    expect(json.publishConfig?.access).toBe('public');
  });

  it.each(publishable)('$json.name pins every dependency exactly (D-5)', ({ json }) => {
    const all = { ...json.dependencies, ...json.devDependencies };
    for (const [dep, range] of Object.entries(all)) {
      expect(`${dep}@${range}`).toMatch(/@\d+\.\d+\.\d+$/);
    }
  });
});

describe('PROTECTED INVARIANT: the storage package ships its migrations', () => {
  // tsc does not copy .sql into dist, so the built runner resolves them from
  // the sibling src tree. If `files` omits that tree, the published package
  // installs cleanly and then fails at first use with "no such table" — the
  // exact failure students would hit and we would never see from the repo.
  const storage = publishable.find(({ json }) => json.name === '@deepdive/storage')!;

  it('lists the migrations directory in files', () => {
    expect(storage.json.files).toContain('src/migrations');
  });

  it('has SQL in the directory it promises to ship', () => {
    const dir = path.join(repoRoot, storage.dir, 'src', 'migrations');
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.sql'))).toBe(true);
  });
});

describe('the CLI is installable as a command', () => {
  const cli = publishable.find(({ json }) => json.name === '@deepdive/cli')!;
  const pkg = cli.json as PackageJson & { bin?: Record<string, string> };

  it('exposes a deepdive bin', () => {
    expect(pkg.bin?.deepdive).toBe('dist/bin.js');
  });

  it('has a shebang on the entry point, so npm can link it', () => {
    const source = fs.readFileSync(path.join(repoRoot, cli.dir, 'src', 'bin.ts'), 'utf8');
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
