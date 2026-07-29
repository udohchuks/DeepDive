import { Vcs, PrOptions } from '@deepdive/core';
import { execFile } from 'child_process';
import { promisify } from 'util';

/**
 * All git invocations use execFile with an argument array rather than exec with
 * an interpolated shell string. No shell is spawned, so user-controlled values
 * (student commit messages, repo URLs, branch names, citation paths) cannot
 * break out of their argument position.
 */
const execFileAsync = promisify(execFile);

/** Rejects values git would parse as an option rather than an operand. */
function assertNotOptionLike(value: string, label: string): void {
  if (value.startsWith('-')) {
    throw new Error(`Invalid ${label}: must not begin with "-" (git would parse it as an option).`);
  }
}

export class GitVcs implements Vcs {
  async clone(repoUrl: string, targetPath: string): Promise<void> {
    assertNotOptionLike(repoUrl, 'repository URL');
    assertNotOptionLike(targetPath, 'target path');
    await execFileAsync('git', ['clone', '--', repoUrl, targetPath]);
  }

  async checkoutCommit(targetPath: string, commitSha: string): Promise<void> {
    assertNotOptionLike(commitSha, 'commit sha');
    await execFileAsync('git', ['-C', targetPath, 'checkout', '--', commitSha]);
  }

  async createBranch(targetPath: string, branchName: string): Promise<void> {
    assertNotOptionLike(branchName, 'branch name');
    await execFileAsync('git', ['-C', targetPath, 'checkout', '-b', branchName]);
  }

  async getDiff(targetPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', targetPath, 'diff']);
    return stdout;
  }

  async getStatus(targetPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', targetPath, 'status', '--porcelain']);
    return stdout;
  }

  async getLog(targetPath: string, maxCount = 10): Promise<string[]> {
    if (!Number.isInteger(maxCount) || maxCount < 1) {
      throw new Error('Invalid maxCount: must be a positive integer.');
    }
    const { stdout } = await execFileAsync('git', ['-C', targetPath, 'log', '-n', String(maxCount), '--oneline']);
    return stdout.trim().split('\n').filter(Boolean);
  }

  async commit(targetPath: string, message: string): Promise<string> {
    await execFileAsync('git', ['-C', targetPath, 'add', '.']);
    // message is student-authored; passed as a discrete argv entry, never through a shell.
    await execFileAsync('git', ['-C', targetPath, 'commit', '-m', message]);
    const { stdout } = await execFileAsync('git', ['-C', targetPath, 'rev-parse', 'HEAD']);
    return stdout.trim();
  }

  async createPullRequest(options: PrOptions): Promise<{ prUrl: string; prNumber: number }> {
    return {
      prUrl: `${options.repoUrl}/pull/1`,
      prNumber: 1,
    };
  }

  async getHeadCommitSha(targetPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', targetPath, 'rev-parse', 'HEAD']);
    return stdout.trim();
  }

  async fileExistsAtCommit(targetPath: string, commitSha: string, relativeFilePath: string): Promise<boolean> {
    assertNotOptionLike(commitSha, 'commit sha');
    try {
      await execFileAsync('git', ['-C', targetPath, 'cat-file', '-e', `${commitSha}:${relativeFilePath}`]);
      return true;
    } catch {
      return false;
    }
  }
}
