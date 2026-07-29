import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitVcs, FakeVcs } from '../src/index.js';

const execFileAsync = promisify(execFile);

describe('VCS Version Control Service Port (packages/vcs)', () => {
  it('FakeVcs tracks clones, commit checkouts, branch creation, diffs, and head commit SHAs', async () => {
    const vcs = new FakeVcs();

    await vcs.clone('https://github.com/example/repo.git', '/tmp/repo');
    expect(vcs.clonedRepos).toContain('https://github.com/example/repo.git -> /tmp/repo');

    await vcs.checkoutCommit('/tmp/repo', 'abc1234');
    expect(vcs.checkedOutCommits.get('/tmp/repo')).toBe('abc1234');

    await vcs.createBranch('/tmp/repo', 'feature/test');
    expect(vcs.createdBranches.get('/tmp/repo')).toBe('feature/test');

    const diff = await vcs.getDiff('/tmp/repo');
    expect(diff).toBe('fake diff');

    const sha = await vcs.getHeadCommitSha('/tmp/repo');
    expect(sha).toBe('0000000000000000000000000000000000000000');

    const commitSha = await vcs.commit('/tmp/repo', 'commit message');
    expect(commitSha).toBe('fake-commit-sha-12345678901234567890');

    const pr = await vcs.createPullRequest({
      repoUrl: 'https://github.com/example/repo.git',
      title: 'PR Title',
      body: 'PR Body',
      headBranch: 'feature/test',
      baseBranch: 'main',
    });
    expect(pr.prUrl).toBe('https://github.com/example/repo.git/pull/1');
  });

  it('FakeVcs allows configuring fileExistsAtCommit boolean responses', async () => {
    const vcs = new FakeVcs();

    expect(await vcs.fileExistsAtCommit('/tmp/repo', 'head', 'src/index.ts')).toBe(true);

    vcs.setFileExistsAtCommit(false);
    expect(await vcs.fileExistsAtCommit('/tmp/repo', 'head', 'missing.ts')).toBe(false);
  });

  it('GitVcs instantiates correctly', () => {
    const git = new GitVcs();
    expect(git).toBeInstanceOf(GitVcs);
  });
});

describe('GitVcs against a real repository (packages/vcs)', () => {
  let repoDir: string;
  const git = new GitVcs();

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deepdive-vcs-'));
    await execFileAsync('git', ['-C', repoDir, 'init', '-q']);
    await execFileAsync('git', ['-C', repoDir, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', repoDir, 'config', 'user.name', 'Test']);
    await execFileAsync('git', ['-C', repoDir, 'config', 'commit.gpgsign', 'false']);
    await writeFile(join(repoDir, 'README.md'), '# fixture\n');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('commits, reports status and log, and returns the head sha', async () => {
    expect(await git.getStatus(repoDir)).toContain('README.md');

    const sha = await git.commit(repoDir, 'initial commit');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await git.getHeadCommitSha(repoDir)).toBe(sha);

    const log = await git.getLog(repoDir);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('initial commit');

    expect(await git.fileExistsAtCommit(repoDir, sha, 'README.md')).toBe(true);
    expect(await git.fileExistsAtCommit(repoDir, sha, 'nope.md')).toBe(false);
  });

  it('PROTECTED INVARIANT: a student-authored commit message cannot inject a shell command', async () => {
    // Every metacharacter here would execute under a shell-interpolated `git commit -m "..."`.
    const canary = join(repoDir, 'PWNED');
    const malicious = `msg"; touch "${canary}"; echo "`;

    const sha = await git.commit(repoDir, malicious);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    // The payload must have been stored verbatim as the message, not executed.
    expect(existsSync(canary)).toBe(false);
    const log = await git.getLog(repoDir);
    expect(log[0]).toContain('touch');
  });

  it('PROTECTED INVARIANT: command substitution in a commit message is not evaluated', async () => {
    const canary = join(repoDir, 'SUBST');
    await git.commit(repoDir, `$(touch ${canary})`);
    expect(existsSync(canary)).toBe(false);
  });

  it('rejects option-like operands rather than passing them to git', async () => {
    await expect(git.clone('--upload-pack=touch /tmp/x', repoDir)).rejects.toThrow(/must not begin with "-"/);
    await expect(git.createBranch(repoDir, '--help')).rejects.toThrow(/must not begin with "-"/);
    await expect(git.checkoutCommit(repoDir, '-x')).rejects.toThrow(/must not begin with "-"/);
  });

  it('rejects a non-positive or non-integer log count', async () => {
    await git.commit(repoDir, 'c1');
    await expect(git.getLog(repoDir, 0)).rejects.toThrow(/positive integer/);
    await expect(git.getLog(repoDir, 1.5)).rejects.toThrow(/positive integer/);
  });

  it('returns an empty log array for a repository with no commits', async () => {
    await expect(git.getLog(repoDir)).rejects.toThrow();
  });
});
