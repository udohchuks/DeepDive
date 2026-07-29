import { describe, it, expect } from 'vitest';
import path from 'path';
import { PathPolicyEvaluator, classifyCommand } from '../src/index.js';

describe('Sandbox Policy Evaluator (Phase 2.2)', () => {
  const rootDir = process.cwd();
  const policy = {
    readOnlyPaths: [path.join(rootDir, 'packages')],
    readWritePaths: [path.join(rootDir, 'packages/sandbox/tests')],
    blockedPaths: [path.join(rootDir, 'packages/sandbox/tests/blocked')],
  };

  const evaluator = new PathPolicyEvaluator(policy);

  it('allows write access inside readWritePaths', () => {
    const target = path.join(rootDir, 'packages/sandbox/tests/test_file.txt');
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
    const target = path.join(rootDir, 'packages/sandbox/tests/../../core/src/index.ts');
    const result = evaluator.evaluateWriteAccess(target);
    expect(result.allowed).toBe(false);
  });

  it('blocks explicitly blocked paths', () => {
    const target = path.join(rootDir, 'packages/sandbox/tests/blocked/secret.txt');
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
});
