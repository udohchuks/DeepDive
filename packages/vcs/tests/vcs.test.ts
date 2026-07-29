import { describe, it, expect } from 'vitest';
import { GitVcs, FakeVcs } from '../src/index.js';

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
