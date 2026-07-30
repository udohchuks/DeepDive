import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Vcs, PrOptions } from '@deepdive/core';
import { readOnboardingConfig, runOnboard, verifyRsddCitations } from '../src/onboarding_commands.js';

const created: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepdive-ob-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length) fs.rmSync(created.pop()!, { recursive: true, force: true });
});

const HEAD = 'a'.repeat(40);

/** Stands in for git: records what was asked and answers from a fixed file set. */
class FakeVcs implements Vcs {
  cloned: { repoUrl: string; targetPath: string }[] = [];
  askedFor: { sha: string; filePath: string }[] = [];

  constructor(private readonly filesAtHead: string[] = []) {}

  async clone(repoUrl: string, targetPath: string): Promise<void> {
    this.cloned.push({ repoUrl, targetPath });
    fs.mkdirSync(targetPath, { recursive: true });
  }
  async getHeadCommitSha(): Promise<string> {
    return HEAD;
  }
  async fileExistsAtCommit(_t: string, sha: string, filePath: string): Promise<boolean> {
    this.askedFor.push({ sha, filePath });
    return this.filesAtHead.includes(filePath);
  }
  async checkoutCommit(): Promise<void> {}
  async createBranch(): Promise<void> {}
  async getDiff(): Promise<string> {
    return '';
  }
  async getStatus(): Promise<string> {
    return '';
  }
  async getLog(): Promise<string[]> {
    return [];
  }
  async commit(): Promise<string> {
    return HEAD;
  }
  async createPullRequest(o: PrOptions): Promise<{ prUrl: string; prNumber: number }> {
    return { prUrl: o.repoUrl, prNumber: 1 };
  }
}

function rsdd(citations: { filePath: string }[]): Record<string, unknown> {
  return {
    targetCommitSha: HEAD,
    modules: [{ id: 'm1', name: 'auth', purpose: 'p', dependencies: [], citations }],
  };
}

describe('deepdive onboard', () => {
  it('pins the commit at clone time rather than resolving it per submission', async () => {
    const vcs = new FakeVcs();
    const dir = path.join(tempDir(), 'repo');

    const result = await runOnboard('https://example.test/repo.git', dir, vcs);

    // Upstream moves. A citation checked against a moving target would pass one
    // day and fail the next with the student's work unchanged.
    expect(result.config.targetCommitSha).toBe(HEAD);
    expect(readOnboardingConfig(dir)?.targetCommitSha).toBe(HEAD);
    expect(vcs.cloned).toEqual([{ repoUrl: 'https://example.test/repo.git', targetPath: dir }]);
  });

  it('refuses to clone into a non-empty directory', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'mine.txt'), 'my work');

    await expect(runOnboard('https://example.test/repo.git', dir, new FakeVcs())).rejects.toThrow(
      /not empty/,
    );
  });

  it('reports a greenfield workspace as not onboarding', () => {
    expect(readOnboardingConfig(tempDir())).toBeNull();
  });

  it('refuses to treat a corrupt config as a trusted workspace', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, '.deepdive'));
    fs.writeFileSync(path.join(dir, '.deepdive', 'config.json'), '{ not json');

    // Falling back to null here would silently downgrade a clone of someone
    // else's code to "your own project", skipping the third-party prompt.
    expect(() => readOnboardingConfig(dir)).toThrow(/Unreadable/);
  });
});

describe('PROTECTED INVARIANT: RSDD citations are checked against the repository', () => {
  async function workspace(vcs: Vcs): Promise<string> {
    const dir = path.join(tempDir(), 'repo');
    await runOnboard('https://example.test/repo.git', dir, vcs);
    return dir;
  }

  it('passes when every cited file exists at the pinned commit', async () => {
    const vcs = new FakeVcs(['src/auth.ts']);
    const dir = await workspace(vcs);

    const result = await verifyRsddCitations(rsdd([{ filePath: 'src/auth.ts' }]), dir, vcs);

    expect(result.passed).toBe(true);
    expect(vcs.askedFor).toContainEqual({ sha: HEAD, filePath: 'src/auth.ts' });
  });

  it('rejects a citation to a file that does not exist, with no model call', async () => {
    const vcs = new FakeVcs(['src/auth.ts']);
    const dir = await workspace(vcs);

    const result = await verifyRsddCitations(rsdd([{ filePath: 'src/invented.ts' }]), dir, vcs);

    // The whole point of onboarding mode: the student must have read the code.
    // A citation nothing can resolve is the cheapest possible thing to catch.
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.targetFieldId).toBe('rsdd_citations_grounded');
    expect(result.lines.join('\n')).toContain('src/invented.ts');
  });

  it('rejects an RSDD describing a different commit than the workspace is pinned to', async () => {
    const vcs = new FakeVcs(['src/auth.ts']);
    const dir = await workspace(vcs);

    const payload = { ...rsdd([{ filePath: 'src/auth.ts' }]), targetCommitSha: 'b'.repeat(40) };
    const result = await verifyRsddCitations(payload, dir, vcs);

    // Otherwise the citations were verified against a tree we never cloned.
    expect(result.passed).toBe(false);
    expect(result.lines.join('\n')).toMatch(/pinned to/);
  });

  it('refuses to grade an RSDD outside an onboarding workspace', async () => {
    await expect(
      verifyRsddCitations(rsdd([{ filePath: 'x.ts' }]), tempDir(), new FakeVcs()),
    ).rejects.toThrow(/not an onboarding workspace/);
  });
});
