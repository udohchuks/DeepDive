export interface PrOptions {
  repoUrl: string;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
}

export interface Vcs {
  clone(repoUrl: string, targetPath: string): Promise<void>;
  checkoutCommit(targetPath: string, commitSha: string): Promise<void>;
  createBranch(targetPath: string, branchName: string): Promise<void>;
  getDiff(targetPath: string): Promise<string>;
  commit(targetPath: string, message: string): Promise<string>;
  createPullRequest(options: PrOptions): Promise<{ prUrl: string; prNumber: number }>;
  getHeadCommitSha(targetPath: string): Promise<string>;
  fileExistsAtCommit(targetPath: string, commitSha: string, relativeFilePath: string): Promise<boolean>;
}

/** In-Memory Fake VCS exported for test use */
export class FakeVcs implements Vcs {
  public clonedRepos: string[] = [];
  public checkedOutCommits = new Map<string, string>();
  public createdBranches = new Map<string, string>();
  public diffOutput = 'fake diff';
  public defaultHeadCommitSha = '0000000000000000000000000000000000000000';
  public fileExistsAtCommitResult = true;

  async clone(repoUrl: string, targetPath: string): Promise<void> {
    this.clonedRepos.push(`${repoUrl} -> ${targetPath}`);
  }

  async checkoutCommit(targetPath: string, commitSha: string): Promise<void> {
    this.checkedOutCommits.set(targetPath, commitSha);
  }

  async createBranch(targetPath: string, branchName: string): Promise<void> {
    this.createdBranches.set(targetPath, branchName);
  }

  async getDiff(_targetPath: string): Promise<string> {
    return this.diffOutput;
  }

  async commit(_targetPath: string, _message: string): Promise<string> {
    return 'fake-commit-sha-12345678901234567890';
  }

  async createPullRequest(options: PrOptions): Promise<{ prUrl: string; prNumber: number }> {
    return {
      prUrl: `${options.repoUrl}/pull/1`,
      prNumber: 1,
    };
  }

  async getHeadCommitSha(_targetPath: string): Promise<string> {
    return this.defaultHeadCommitSha;
  }

  async fileExistsAtCommit(_targetPath: string, _commitSha: string, _relativeFilePath: string): Promise<boolean> {
    return this.fileExistsAtCommitResult;
  }

  setFileExistsAtCommit(result: boolean): void {
    this.fileExistsAtCommitResult = result;
  }
}
