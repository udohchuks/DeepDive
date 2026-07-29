import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  FixedClock,
  SystemClock,
  FixedIdGenerator,
  CryptoIdGenerator,
  FakeModelProvider,
  FakeHintService,
  FakeTestRunner,
  FakeVcs,
} from '../src/index.js';
import { z } from 'zod';

describe('Service Ports & Fakes (Phase 1.2)', () => {
  it('FixedClock and FixedIdGenerator provide deterministic time and IDs (D-3)', () => {
    const fixedTime = new Date('2026-01-01T00:00:00.000Z');
    const clock = new FixedClock(fixedTime);
    expect(clock.now()).toEqual(fixedTime);
    expect(clock.isoString()).toBe('2026-01-01T00:00:00.000Z');

    const idGen = new FixedIdGenerator('test-id');
    expect(idGen.generate()).toBe('test-id-1');
    expect(idGen.generate()).toBe('test-id-2');

    idGen.reset();
    expect(idGen.generate()).toBe('test-id-1');
  });

  it('SystemClock and CryptoIdGenerator implement interfaces correctly', () => {
    const sysClock = new SystemClock();
    expect(sysClock.now()).toBeInstanceOf(Date);
    expect(typeof sysClock.isoString()).toBe('string');

    const cryptoIdGen = new CryptoIdGenerator();
    const id = cryptoIdGen.generate();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(10);
  });

  it('FakeModelProvider conforms to ModelProvider interface', async () => {
    const provider = new FakeModelProvider();
    const schema = z.object({ verdict: z.string() });

    provider.setResponse('grader', 'v1', { verdict: 'approved' });

    const result = await provider.generateStructured({
      role: 'grader',
      promptVersion: 'v1',
      systemPrompt: 'System',
      userPrompt: 'User',
      schema,
    });
    expect(result).toEqual({ verdict: 'approved' });

    await expect(
      provider.generateStructured({
        role: 'grader',
        promptVersion: 'v2',
        systemPrompt: 'System',
        userPrompt: 'User',
        schema,
      }),
    ).rejects.toThrow('Cache miss');
  });

  it('FakeHintService conforms to HintService interface', async () => {
    const hintService = new FakeHintService();
    const hint = await hintService.revealHint({
      turnId: 'turn-1',
      targetFieldId: 'field.a',
      level: 'L1',
    });
    expect(hint.level).toBe('L1');
    expect(hint.content).toContain('field.a');
  });

  it('FakeTestRunner conforms to TestRunner interface', async () => {
    const runner = new FakeTestRunner();
    const result = await runner.runTests('/workspace');
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(5);
  });

  it('FakeVcs conforms to Vcs interface', async () => {
    const vcs = new FakeVcs();
    await vcs.clone('https://github.com/test/repo', '/tmp/repo');
    expect(vcs.clonedRepos).toContain('https://github.com/test/repo -> /tmp/repo');

    const diff = await vcs.getDiff('/tmp/repo');
    expect(diff).toBe('fake diff');

    const pr = await vcs.createPullRequest({
      repoUrl: 'https://github.com/test/repo',
      title: 'Fix',
      body: 'Fix bug',
      headBranch: 'fix',
      baseBranch: 'main',
    });
    expect(pr.prUrl).toBe('https://github.com/test/repo/pull/1');
  });

  it('LINT: no direct Date.now, Math.random, or crypto.randomUUID calls in src/ outside clock.ts (D-3)', () => {
    const packagesDir = path.resolve(process.cwd(), 'packages');
    const forbiddenCalls = ['Date' + '.now()', 'Math' + '.random()', 'crypto' + '.randomUUID()'];
    const violations: string[] = [];

    function scanFile(filePath: string) {
      if (filePath.endsWith('clock.ts')) return; // clock.ts is the production wiring module
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const call of forbiddenCalls) {
        if (content.includes(call)) {
          violations.push(`${path.relative(process.cwd(), filePath)} calls ${call}`);
        }
      }
    }

    function scanDirectory(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist' && entry !== 'tests') {
          scanDirectory(full);
        } else if (stat.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
          scanFile(full);
        }
      }
    }

    scanDirectory(packagesDir);
    expect(violations, `Found direct ambient time/randomness calls: ${violations.join(', ')}`).toEqual([]);
  });
});
