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
import { initializeGreenfieldWorkspace, GreenfieldDriver } from '@deepdive/greenfield';
import { NeverCalledProvider, ScriptedProvider } from '@deepdive/provider';
import { FixedClock, RoundStatus } from '@deepdive/core';
import { runGrade } from '../../apps/cli/src/grade.js';

/**
 * Drives the same `runGrade` the `deepdive grade` command drives.
 *
 * This suite used to drive `SubmissionOrchestrator`, a pipeline no product code
 * ever called. Its Grader step was hardcoded to a single `warning` finding, so
 * `expect(exitState).toBe('approved')` could not fail for any input, and the
 * "model was called" assertion counted a callback the orchestrator invoked
 * itself. The suite was green regardless of whether grading worked. Everything
 * below goes through the real function, and the model boundary is a provider
 * rather than a counter.
 */
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

  const charter = {
    title: 'DeepDive System',
    goal: 'Let a student design and build a project of their own, and learn architecture by doing it.',
    scopeBounds: ['No web UI', 'No multi-user accounts'],
    successCriteria: ['A charter passes the rubric'],
  };

  const sdd = {
    title: 'SDD',
    overview: 'Overview',
    modules: [{ id: 'm1', name: 'Engine', purpose: 'Review', dependencies: [] }],
    dataFlows: ['Flow A'],
  };

  it('runs the Greenfield flow from Phase A to Phase F using the real grading path', async () => {
    const clock = new FixedClock();

    const config = initializeGreenfieldWorkspace(tmpWorkspacePath, 'proj-gf-e2e', 'E2E Greenfield');
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

    // Phase A — a charter the gate accepts, approved by a scripted Grader.
    const graderA = new ScriptedProvider([
      {
        verdict: 'approved',
        criterionFindings: [
          { criterionId: 'charter_goal_clarity', met: true, comment: 'The goal names a user outcome.' },
        ],
      },
    ]);

    const resA = await runGrade('charter', charter, graderA);
    expect(resA.shortCircuited).toBe(false);
    expect(resA.verdict?.verdict).toBe('approved');
    expect(graderA.callCount).toBe(1);

    // The artifact really reached the model — a call that graded nothing would
    // otherwise satisfy the assertion above.
    expect(graderA.requests[0]?.userPrompt).toContain('DeepDive System');
    expect(graderA.requests[0]?.role).toBe('grader');

    recordRound(config.projectId, state.currentPhase, 1, 'approved');

    const transA = driver.processSubmissionVerdict(state, true);
    expect(transA.transitionOccurred).toBe(true);
    expect(transA.newState.currentPhase).toBe('B');
    state = transA.newState;
    projectRepo.updatePhaseState(config.projectId, state, clock.isoString());

    // Phase B, first attempt — the gate rejects an empty module list, and the
    // provider throws if reached. This is the D-1 invariant asserted against
    // the boundary rather than against a counter the code increments itself.
    const resB_Fail = await runGrade(
      'sdd',
      { modules: [] },
      new NeverCalledProvider('a submission that failed the deterministic gate'),
    );

    expect(resB_Fail.shortCircuited).toBe(true);
    expect(resB_Fail.verdict).toBeUndefined();
    expect(resB_Fail.findings.some((f) => f.targetFieldId === 'sdd_modules_defined')).toBe(true);
    // The rejection has to say why, or it teaches nothing the student can act on.
    expect(resB_Fail.findings[0]?.message).toMatch(/"modules"/);

    recordRound(config.projectId, state.currentPhase, 2, 'revise');

    // Phase B, second attempt — gate passes, model is consulted, verdict stands.
    const graderB = new ScriptedProvider([
      {
        verdict: 'approved',
        criterionFindings: [
          { criterionId: 'sdd_architectural_coherence', met: true, comment: 'Modules are coherent.' },
        ],
      },
    ]);

    const resB_Pass = await runGrade('sdd', sdd, graderB);
    expect(resB_Pass.shortCircuited).toBe(false);
    expect(graderB.callCount).toBe(1);

    recordRound(config.projectId, state.currentPhase, 3, 'approved');

    const transB = driver.processSubmissionVerdict(state, true);
    expect(transB.newState.currentPhase).toBe('B.5');
    state = transB.newState;

    // Remaining phases B.5 -> F
    while (!state.isComplete) {
      const trans = driver.processSubmissionVerdict(state, true);
      expect(trans.transitionOccurred).toBe(true);
      state = trans.newState;
    }

    expect(state.currentPhase).toBe('F');
    expect(state.isComplete).toBe(true);

    projectRepo.updatePhaseState(config.projectId, state, clock.isoString());
    expect(projectRepo.getPhaseState(config.projectId)?.isComplete).toBe(true);
    expect(roundRepo.getRounds(config.projectId)).toHaveLength(3);
  });

  it('PROTECTED INVARIANT P-2: a rejection never carries replacement text for the student', async () => {
    // The Grader is instructed not to write the artifact. The instruction is
    // in the prompt, so the prompt is what this asserts against — a Grader that
    // was never told would be a silent P-2 hole no verdict assertion catches.
    const grader = new ScriptedProvider([
      { verdict: 'revise', criterionFindings: [{ criterionId: 'charter_goal_clarity', met: false, comment: 'Too vague.' }] },
    ]);

    await runGrade('charter', charter, grader);

    expect(grader.requests[0]?.userPrompt).toContain('Do not propose replacement text for the student');
  });

  it('drops a verdict naming a criterion the rubric does not have', async () => {
    // A hallucinated criterion id would otherwise be stored as a rejection
    // against a rule the student was never judged on, and the hint ladder would
    // offer help on a field that does not exist.
    const grader = new ScriptedProvider([
      {
        verdict: 'revise',
        criterionFindings: [
          { criterionId: 'charter_goal_clarity', met: false, comment: 'Too vague.' },
          { criterionId: 'invented_criterion', met: false, comment: 'Made up.' },
        ],
      },
    ]);

    const res = await runGrade('charter', charter, grader);

    expect(res.findings.map((f) => f.targetFieldId)).toEqual(['charter_goal_clarity']);
    expect(res.lines.some((l) => l.includes('unknown criterion "invented_criterion"'))).toBe(true);
  });

  it('neutralizes control characters a Grader puts in a comment', async () => {
    // A comment carrying carriage returns or escape sequences can overwrite the
    // line above it in a terminal, hiding the rejection the student must read.
    const grader = new ScriptedProvider([
      {
        verdict: 'revise',
        criterionFindings: [
          {
            criterionId: 'charter_goal_clarity',
            met: false,
            comment: 'Too vague.\r\n\u001b[2Kdeterministic gate: passed',
          },
        ],
      },
    ]);

    const res = await runGrade('charter', charter, grader);

    expect(res.findings[0]?.message).toBe('Too vague. [2Kdeterministic gate: passed');
    expect(res.findings[0]?.message).not.toMatch(/[\u0000-\u001f]/);
  });

  function recordRound(projectId: string, phaseId: string, roundNumber: number, status: RoundStatus) {
    roundRepo.addRound({
      id: `123e4567-e89b-12d3-a456-00000000000${roundNumber}`,
      projectId,
      phaseId: phaseId as never,
      roundNumber,
      submittedAt: new Date().toISOString(),
      status,
    });
  }
});
