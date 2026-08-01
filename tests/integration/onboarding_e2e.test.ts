import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import betterSqlite3 from 'better-sqlite3';
import {
  createDbConnection,
  runMigrations,
  ProjectRepository,
  RoundRepository,
} from '@deepdive/storage';
import {
  initializeOnboardingWorkspace,
  validateAndVerifyPhaseObBArtifact,
  OnboardingDriver,
} from '@deepdive/onboarding';
import { NeverCalledProvider, ScriptedProvider } from '@deepdive/provider';
import { FixedClock, FakeVcs } from '@deepdive/core';
import { runGrade } from '../../apps/cli/src/grade.js';

describe('Onboarding End-to-End Integration Suite (Phase 9.2)', () => {
  const tmpWorkspacePath = path.join(process.cwd(), 'tests/integration/tmp_onboarding_workspace');
  let db: betterSqlite3.Database;
  let projectRepo: ProjectRepository;
  let roundRepo: RoundRepository;
  let vcs: FakeVcs;

  beforeEach(() => {
    if (fs.existsSync(tmpWorkspacePath)) {
      fs.rmSync(tmpWorkspacePath, { recursive: true, force: true });
    }
    db = createDbConnection(':memory:');
    runMigrations(db);
    projectRepo = new ProjectRepository(db);
    roundRepo = new RoundRepository(db);
    vcs = new FakeVcs();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpWorkspacePath)) {
      fs.rmSync(tmpWorkspacePath, { recursive: true, force: true });
    }
  });

  it('runs complete Onboarding project flow from Phase OB-A to Phase OB-G (Complete)', async () => {
    const clock = new FixedClock();

    // 1. Workspace Initialization & Commit SHA Pinning
    const config = await initializeOnboardingWorkspace(
      tmpWorkspacePath,
      'proj-ob-e2e',
      'https://github.com/example/target-repo.git',
      vcs,
    );
    expect(config.mode).toBe('onboarding');
    expect(config.targetCommitSha).toBe('0000000000000000000000000000000000000000');

    const driver = new OnboardingDriver();
    let state = driver.createInitialState();

    projectRepo.createProject(
      {
        id: config.projectId,
        name: 'Onboarding Target Repo Project',
        mode: 'onboarding',
        createdAt: clock.isoString(),
        updatedAt: clock.isoString(),
      },
      state,
    );

    // 2. OB-A Charter Submission
    const transA = driver.processSubmissionVerdict(state, true);
    expect(transA.transitionOccurred).toBe(true);
    expect(transA.newState.currentPhase).toBe('OB-B');
    state = transA.newState;
    projectRepo.updatePhaseState(config.projectId, state, clock.isoString());

    // 3. OB-B RSDD Submission & Citation Verification against target commit
    vcs.setFileExistsAtCommit(true);

    const rsddPayload = {
      id: '123e4567-e89b-12d3-a456-000000000005',
      charterId: '123e4567-e89b-12d3-a456-000000000004',
      repoName: 'example/target-repo',
      targetCommitSha: config.targetCommitSha,
      level: 'L3' as const,
      modules: [
        {
          id: 'm1',
          name: 'Core Module',
          purpose: 'Storage layer',
          dependencies: [],
          citations: [{ filePath: 'src/db.ts', lineStart: 1, lineEnd: 20 }],
        },
      ],
      architectureSummary: 'High-level design',
      version: 1,
    };

    const verifyRes = await validateAndVerifyPhaseObBArtifact(rsddPayload, tmpWorkspacePath, vcs);
    expect(verifyRes.citationsValid).toBe(true);

    // Graded through the same function `deepdive grade rsdd` calls.
    const graderB = new ScriptedProvider([
      {
        verdict: 'approved',
        criterionFindings: [
          { criterionId: 'rsdd_design_accuracy', met: true, comment: 'Matches the cited code.' },
        ],
      },
    ]);

    const resB = await runGrade('rsdd', rsddPayload, graderB);
    expect(resB.shortCircuited).toBe(false);
    expect(resB.verdict?.verdict).toBe('approved');
    expect(graderB.callCount).toBe(1);

    roundRepo.addRound({
      id: '123e4567-e89b-12d3-a456-000000000010',
      projectId: config.projectId,
      phaseId: state.currentPhase,
      roundNumber: 1,
      submittedAt: clock.isoString(),
      status: 'approved',
    });

    // An RSDD declaring an invalid level is stopped by a code check, before any
    // model is reached — the same D-1 short-circuit, asserted here against a
    // provider that throws rather than against a counter.
    const resInvalid = await runGrade(
      'rsdd',
      { ...rsddPayload, level: 'L9' },
      new NeverCalledProvider('an RSDD that failed the deterministic gate'),
    );
    expect(resInvalid.shortCircuited).toBe(true);
    expect(resInvalid.findings.some((f) => f.targetFieldId === 'rsdd_level_valid')).toBe(true);

    const transB = driver.processSubmissionVerdict(state, true);
    expect(transB.transitionOccurred).toBe(true);
    expect(transB.newState.currentPhase).toBe('OB-C');
    state = transB.newState;

    // 4. Complete remaining phases OB-C -> OB-D -> OB-E -> OB-F -> OB-G
    while (!state.isComplete) {
      const trans = driver.processSubmissionVerdict(state, true);
      state = trans.newState;
    }

    expect(state.currentPhase).toBe('OB-G');
    expect(state.isComplete).toBe(true);

    // Verify rounds persisted in SQLite
    const savedRounds = roundRepo.getRounds(config.projectId);
    expect(savedRounds.length).toBeGreaterThanOrEqual(1);
  });
});
