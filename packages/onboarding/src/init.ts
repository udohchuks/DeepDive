import fs from 'fs';
import path from 'path';
import { Vcs } from '@deepdive/core';

export interface OnboardingConfig {
  mode: 'onboarding';
  projectId: string;
  repoUrl: string;
  targetCommitSha: string;
  createdAt: string;
}

export async function initializeOnboardingWorkspace(
  workspacePath: string,
  projectId: string,
  repoUrl: string,
  vcs: Vcs,
): Promise<OnboardingConfig> {
  const dotDir = path.join(workspacePath, '.deepdive');
  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true });
  }

  const targetCommitSha = await vcs.getHeadCommitSha(workspacePath);

  const config: OnboardingConfig = {
    mode: 'onboarding',
    projectId,
    repoUrl,
    targetCommitSha,
    createdAt: new Date().toISOString(),
  };

  const configPath = path.join(dotDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  return config;
}
