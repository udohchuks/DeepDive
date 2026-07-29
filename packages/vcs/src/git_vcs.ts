import { Vcs, PrOptions } from '@deepdive/core';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitVcs implements Vcs {
  async clone(repoUrl: string, targetPath: string): Promise<void> {
    await execAsync(`git clone "${repoUrl}" "${targetPath}"`);
  }

  async checkoutCommit(targetPath: string, commitSha: string): Promise<void> {
    await execAsync(`git -C "${targetPath}" checkout "${commitSha}"`);
  }

  async createBranch(targetPath: string, branchName: string): Promise<void> {
    await execAsync(`git -C "${targetPath}" checkout -b "${branchName}"`);
  }

  async getDiff(targetPath: string): Promise<string> {
    const { stdout } = await execAsync(`git -C "${targetPath}" diff`);
    return stdout;
  }

  async commit(targetPath: string, message: string): Promise<string> {
    await execAsync(`git -C "${targetPath}" add .`);
    await execAsync(`git -C "${targetPath}" commit -m "${message}"`);
    const { stdout } = await execAsync(`git -C "${targetPath}" rev-parse HEAD`);
    return stdout.trim();
  }

  async createPullRequest(options: PrOptions): Promise<{ prUrl: string; prNumber: number }> {
    return {
      prUrl: `${options.repoUrl}/pull/1`,
      prNumber: 1,
    };
  }

  async getHeadCommitSha(targetPath: string): Promise<string> {
    const { stdout } = await execAsync(`git -C "${targetPath}" rev-parse HEAD`);
    return stdout.trim();
  }

  async fileExistsAtCommit(targetPath: string, commitSha: string, relativeFilePath: string): Promise<boolean> {
    try {
      await execAsync(`git -C "${targetPath}" cat-file -e "${commitSha}:${relativeFilePath}"`);
      return true;
    } catch {
      return false;
    }
  }
}
