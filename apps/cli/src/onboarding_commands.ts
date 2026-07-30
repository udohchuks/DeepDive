import fs from 'fs';
import path from 'path';
import { Vcs, Finding, CryptoIdGenerator } from '@deepdive/core';
import { GitVcs } from '@deepdive/vcs';
import { initializeOnboardingWorkspace, OnboardingConfig } from '@deepdive/onboarding';

export const CONFIG_FILENAME = 'config.json';

/** Path of the onboarding marker file inside a workspace's `.deepdive` dir. */
export function configPath(workspace: string): string {
  return path.join(path.resolve(workspace), '.deepdive', CONFIG_FILENAME);
}

/**
 * Reads a workspace's onboarding config, or null if it is not one.
 *
 * Used both to ground citations against the right commit and to decide whether
 * a workspace holds third-party code, which changes what running its test
 * suite means.
 */
export function readOnboardingConfig(workspace: string): OnboardingConfig | null {
  const file = configPath(workspace);
  if (!fs.existsSync(file)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as OnboardingConfig;
    return parsed.mode === 'onboarding' ? parsed : null;
  } catch {
    // A corrupt config must not silently downgrade the workspace to "trusted".
    throw new Error(`Unreadable onboarding config at ${file}. Delete it or re-run onboard.`);
  }
}

export interface OnboardResult {
  lines: string[];
  config: OnboardingConfig;
}

/**
 * Clones a repository and pins the commit the student will be graded against.
 *
 * The commit sha is recorded at clone time rather than resolved per submission:
 * upstream moves, and a citation checked against a moving target would pass one
 * day and fail the next with the student's work unchanged.
 */
export async function runOnboard(
  repoUrl: string,
  workspace: string,
  vcs: Vcs = new GitVcs(),
  ids = new CryptoIdGenerator(),
): Promise<OnboardResult> {
  const target = path.resolve(workspace);

  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(
      `Refusing to clone into ${target}: directory is not empty. Pick a new directory.`,
    );
  }

  await vcs.clone(repoUrl, target);
  const config = await initializeOnboardingWorkspace(target, ids.generate(), repoUrl, vcs);

  return {
    config,
    lines: [
      `cloned ${repoUrl}`,
      `workspace: ${target}`,
      `pinned commit: ${config.targetCommitSha}`,
      '',
      'This workspace holds third-party code. `scaffold` and `verify` can run its',
      'test suite, which executes that code on your machine — they will ask first.',
      '',
      'Next: write your repo learning charter, then',
      `  deepdive grade charter <charter.json> --project ${target}`,
    ],
  };
}

export interface CitationCheckResult {
  passed: boolean;
  findings: Finding[];
  lines: string[];
}

interface CitedGroup {
  id?: string;
  name?: string;
  citations?: { filePath?: unknown }[];
}

/**
 * Pulls every cited file path out of an onboarding artifact.
 *
 * The three artifacts nest citations differently — an RSDD under `modules`, a
 * reading plan under `readingPlan`, a CDD flat under `targetFiles` — but the
 * guarantee is the same for all of them, so the traversal is shared rather than
 * written once per rubric and drifting.
 */
export function collectCitations(
  payload: Record<string, unknown>,
): { label: string; filePath: string }[] {
  const found: { label: string; filePath: string }[] = [];

  const addGroup = (group: CitedGroup) => {
    const label = group?.name ?? group?.id ?? '?';
    for (const citation of group?.citations ?? []) {
      if (typeof citation?.filePath === 'string') found.push({ label, filePath: citation.filePath });
    }
  };

  for (const key of ['modules', 'readingPlan']) {
    const groups = payload[key];
    if (Array.isArray(groups)) for (const group of groups) addGroup(group as CitedGroup);
  }

  if (Array.isArray(payload.targetFiles)) {
    for (const citation of payload.targetFiles) {
      const filePath = (citation as { filePath?: unknown })?.filePath;
      if (typeof filePath === 'string') found.push({ label: 'targetFiles', filePath });
    }
  }

  return found;
}

/**
 * Verifies every citation in an onboarding artifact resolves at the pinned commit.
 *
 * This is the check the rubrics describe and `check_repo_citations` cannot
 * perform: code checks are pure and synchronous, and answering "does this path
 * exist in the repo" needs git. Running it here, before the gate, means a
 * fabricated citation costs nothing — no model call is made for an artifact
 * whose evidence does not exist.
 */
export async function verifyRepoCitations(
  payload: Record<string, unknown>,
  workspace: string,
  vcs: Vcs = new GitVcs(),
  criterionId = 'rsdd_citations_grounded',
): Promise<CitationCheckResult> {
  const config = readOnboardingConfig(workspace);
  if (!config) {
    throw new Error(
      `${path.resolve(workspace)} is not an onboarding workspace. Run "deepdive onboard <repo-url>" first.`,
    );
  }

  // The artifact names the commit it describes; if that disagrees with the
  // pinned one, the citations were checked against a tree we did not clone.
  const claimed = payload.targetCommitSha;
  if (typeof claimed === 'string' && claimed !== config.targetCommitSha) {
    return {
      passed: false,
      lines: [
        `citation check: FAILED — artifact targets commit ${claimed}, workspace is pinned to ${config.targetCommitSha}`,
      ],
      findings: [
        {
          id: new CryptoIdGenerator().generate(),
          code: 'BOUND_VIOLATED',
          severity: 'error',
          targetFieldId: criterionId,
        },
      ],
    };
  }

  const missing: string[] = [];
  for (const { label, filePath } of collectCitations(payload)) {
    const exists = await vcs.fileExistsAtCommit(workspace, config.targetCommitSha, filePath);
    if (!exists) missing.push(`${label} → ${filePath}`);
  }

  if (missing.length === 0) {
    return {
      passed: true,
      findings: [],
      lines: ['citation check: every cited file exists at the pinned commit'],
    };
  }

  const ids = new CryptoIdGenerator();
  return {
    passed: false,
    lines: [
      'citation check: FAILED — no model call made',
      ...missing.map((m) => `  - no such file at ${config.targetCommitSha.slice(0, 8)}: ${m}`),
    ],
    findings: missing.map(() => ({
      id: ids.generate(),
      code: 'BOUND_VIOLATED' as const,
      severity: 'error' as const,
      targetFieldId: criterionId,
    })),
  };
}
