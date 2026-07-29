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
  initializeGreenfieldWorkspace,
  GreenfieldDriver,
} from '@deepdive/greenfield';
import { SubmissionOrchestrator } from '@deepdive/engine';
import { CharterRubric, SddRubric } from '@deepdive/content';
import { FixedClock, FixedIdGenerator, TestRunResult } from '@deepdive/core';

describe('Greenfield End-to-End Integration Suite (Phase 9.1)', () => {
  const tmpWorkspacePath = path.join(process.cwd(), 'tests/integration/tmp_greenfield_workspace');
  let db: betterSqlite3.Database;
  let projectRepo: ProjectRepository;
  let roundRepo: RoundRepository;

  beforeEach(() => {
    if (fs.existsSync(tmpWorkspacePath)) {
      fs.rmSync(tmpWorkspacePath, { recursive: true, force: true });
    }
    db = createDbConnection(':memory:');
    runMigrations(db);
    projectRepo = new ProjectRepository(db);
    roundRepo = new RoundRepository(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tmpWorkspacePath)) {
      fs.rmSync(tmpWorkspacePath, { recursive: true, force: true });
    }
  });

  it('runs complete Greenfield project flow from Phase A to Phase F (Complete)', async () => {
    const clock = new FixedClock();
    const idGen = new FixedIdGenerator('123e4567-e89b-12d3-a456');

    // 1. Workspace Initialization
    const config = initializeGreenfieldWorkspace(tmpWorkspacePath, 'proj-gf-e2e', 'E2E Greenfield', );
    expect(config.mode).toBe('greenfield');

    const driver = new GreenfieldDriver();
    let state = driver.createInitialState();

    projectRepo.createProject(
      {
        id: config.projectId,
        name: config.projectName,
        mode: 'greenfield',
        createdAt: clock.isoString(),
        updatedAt: clock.isoString(),
      },
      state,
    );

    // 2. Phase A Charter Submission & Review
    const charterPayload = {
      id: '123e4567-e89b-12d3-a456-000000000001',
      title: 'DeepDive System',
      goal: 'Problem statement text',
      techStack: ['TypeScript', 'Node'],
      scopeBounds: ['No web UI'],
      coreFeatures: ['Engine'],
      createdAt: clock.isoString(),
      version: 1,
    };

    const orchestratorA = new SubmissionOrchestrator({
      projectId: config.projectId,
      phaseId: state.currentPhase,
      rubric: CharterRubric,
      artifactPayload: charterPayload,
      roundRepository: roundRepo,
      clock,
      idGenerator: idGen,
    });

    const resA = await orchestratorA.executeReviewRound();
    expect(resA.exitState).toBe('approved');

    const transA = driver.processSubmissionVerdict(state, true);
    expect(transA.transitionOccurred).toBe(true);
    expect(transA.newState.currentPhase).toBe('B');
    state = transA.newState;
    projectRepo.updatePhaseState(config.projectId, state, clock.isoString());

    // 3. Phase B SDD Submission with failing test (Deterministic short-circuit D-1)
    let modelCalls = 0;
    const failingTestResult: TestRunResult = {
      success: false,
      totalPassed: 0,
      totalFailed: 1,
      totalSkipped: 0,
      suites: [],
      rawOutput: 'FAIL sdd_citations_check',
    };

    const orchestratorB_Failing = new SubmissionOrchestrator({
      projectId: config.projectId,
      phaseId: state.currentPhase,
      rubric: SddRubric,
      artifactPayload: { modules: [] },
      roundRepository: roundRepo,
      clock,
      idGenerator: idGen,
      testResult: failingTestResult,
      modelProviderCallCount: () => {
        modelCalls += 1;
      },
    });

    const resB_Fail = await orchestratorB_Failing.executeReviewRound();
    expect(resB_Fail.shortCircuitedByDeterministicGate).toBe(true);
    expect(resB_Fail.exitState).toBe('revise');
    expect(modelCalls).toBe(0); // ZERO model provider calls on failing deterministic check!

    // 4. Phase B Valid SDD Submission & Review
    const passingTestResult: TestRunResult = {
      success: true,
      totalPassed: 5,
      totalFailed: 0,
      totalSkipped: 0,
      suites: [],
      rawOutput: 'ALL PASSED',
    };

    const sddPayload = {
      id: '123e4567-e89b-12d3-a456-000000000002',
      charterId: charterPayload.id,
      title: 'SDD',
      overview: 'Overview',
      modules: [{ id: 'm1', name: 'Engine', purpose: 'Review', dependencies: [] }],
      dataFlows: ['Flow A'],
      version: 1,
    };

    const orchestratorB_Pass = new SubmissionOrchestrator({
      projectId: config.projectId,
      phaseId: state.currentPhase,
      rubric: SddRubric,
      artifactPayload: sddPayload,
      roundRepository: roundRepo,
      clock,
      idGenerator: idGen,
      testResult: passingTestResult,
      modelProviderCallCount: () => {
        modelCalls += 1;
      },
    });

    const resB_Pass = await orchestratorB_Pass.executeReviewRound();
    expect(resB_Pass.shortCircuitedByDeterministicGate).toBe(false);
    expect(modelCalls).toBe(1);

    const transB = driver.processSubmissionVerdict(state, true);
    expect(transB.transitionOccurred).toBe(true);
    expect(transB.newState.currentPhase).toBe('B.5');
    state = transB.newState;

    // 5. Complete remaining phases B.5 -> C -> D -> E -> F
    while (!state.isComplete) {
      const trans = driver.processSubmissionVerdict(state, true);
      state = trans.newState;
    }

    expect(state.currentPhase).toBe('F');
    expect(state.isComplete).toBe(true);

    // Verify rounds persisted in SQLite
    const savedRounds = roundRepo.getRounds(config.projectId);
    expect(savedRounds.length).toBeGreaterThanOrEqual(2);
  });
});
