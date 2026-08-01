import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDbConnection, runMigrations, RoundRepository, RoundRecord, ProjectRepository } from '@deepdive/storage';
import { evaluateDeterministicGate, handleClarifyingResponse } from '../src/index.js';
import { SddRubric } from '@deepdive/content';
import { TestRunResult } from '@deepdive/core';
import betterSqlite3 from 'better-sqlite3';

describe('Submission Pipeline Orchestrator & Deterministic Gate (Phase 5.2)', () => {
  let db: betterSqlite3.Database;
  let roundRepo: RoundRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    runMigrations(db);
    roundRepo = new RoundRepository(db);
    projectRepo = new ProjectRepository(db);

    // Create test project to satisfy SQLite FOREIGN KEY constraint
    projectRepo.createProject(
      {
        id: 'proj-1',
        name: 'Test Project',
        mode: 'greenfield',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        currentPhase: 'B',
        roundCount: 0,
        mode: 'greenfield',
        isComplete: false,
      },
    );
  });

  afterEach(() => {
    db.close();
  });

  it('PROTECTED INVARIANT D-1: a failing test suite fails the gate, which is what stops the model call', () => {
    const failingTestResult: TestRunResult = {
      success: false,
      totalPassed: 2,
      totalFailed: 1,
      totalSkipped: 0,
      suites: [],
      rawOutput: 'FAIL test_mod_a',
    };

    const result = evaluateDeterministicGate(SddRubric, failingTestResult, undefined, {
      modules: [{ id: 'm1' }],
    });

    expect(result.passed).toBe(false);
    const finding = result.failedFindings.find((f) => f.code === 'TEST_SUITE_FAILED');
    expect(finding?.failCount).toBe(1);
    expect(finding?.message).toMatch(/1 test\(s\) failing/);

    // That no model is reached when the gate fails is asserted where the
    // decision is actually made — against a provider that throws if called —
    // in tests/integration/greenfield_e2e.test.ts. This test owns the other
    // half: that a failing suite does fail the gate in the first place.
  });

  it('a gate pass is reported as such, so the caller knows a model call is warranted', () => {
    const passingTestResult: TestRunResult = {
      success: true,
      totalPassed: 5,
      totalFailed: 0,
      totalSkipped: 0,
      suites: [],
      rawOutput: 'ALL PASSED',
    };

    const result = evaluateDeterministicGate(SddRubric, passingTestResult, undefined, {
      modules: [{ id: 'm1', name: 'Engine', purpose: 'Review', dependencies: [] }],
      citations: [],
    });

    expect(result.passed).toBe(true);
    expect(result.failedFindings).toHaveLength(0);
  });

  it('handles clarifying question responses without new Verifier pass', () => {
    const clarifyingRound: RoundRecord = {
      id: '123e4567-e89b-12d3-a456-000000000099',
      projectId: 'proj-1',
      phaseId: 'B',
      roundNumber: 1,
      submittedAt: new Date().toISOString(),
      status: 'clarifying_question',
    };

    const updatedRound = handleClarifyingResponse(clarifyingRound, [
      { questionId: 'q1', answerText: 'We choose AES-GCM.' },
    ]);

    expect(updatedRound.status).toBe('revise');
  });

  it('evaluateDeterministicGate fails closed when artifactPayload is absent', async () => {
    const { evaluateDeterministicGate } = await import('../src/pipeline/deterministic_gate.js');
    const result = evaluateDeterministicGate(SddRubric);
    expect(result.passed).toBe(false);
    expect(result.failedFindings).toHaveLength(2); // check_modules_non_empty and check_citations_valid failed
  });

  it('says why a criterion failed, not only which one', async () => {
    // A bare criterion id names the rule but not the fix. The deterministic
    // gate is the half of grading that teaches for free, so a rejection that
    // explains nothing pushes the student toward a hint — which costs a model
    // call — to learn something a code check already knew.
    const { evaluateDeterministicGate } = await import('../src/pipeline/deterministic_gate.js');
    const result = evaluateDeterministicGate(SddRubric, undefined, undefined, { modules: [] });

    const finding = result.failedFindings.find((f) => f.targetFieldId === 'sdd_modules_defined');
    // Naming the JSON field is the point: the student has no schema in front
    // of them, so "modules must not be empty" alone leaves them guessing which
    // key the rubric meant.
    expect(finding?.message).toMatch(/"modules"/);
  });

  it('falls back to the criterion description when a check gives no message', async () => {
    const { evaluateDeterministicGate } = await import('../src/pipeline/deterministic_gate.js');
    const rubric = {
      ...SddRubric,
      criteria: [
        {
          id: 'silent_criterion',
          description: 'Every module must be declared before it is referenced',
          kind: 'deterministic' as const,
          codeCheckName: 'check_modules_non_empty',
        },
      ],
    };

    const { CodeCheckRegistry } = await import('@deepdive/content');
    const original = CodeCheckRegistry['check_modules_non_empty']!;
    CodeCheckRegistry['check_modules_non_empty'] = () => ({ passed: false });

    try {
      const result = evaluateDeterministicGate(rubric, undefined, undefined, { modules: [] });
      expect(result.failedFindings[0]?.message).toBe(
        'Every module must be declared before it is referenced',
      );
    } finally {
      CodeCheckRegistry['check_modules_non_empty'] = original;
    }
  });

  it('blames the rubric, not the student, when a code check throws', async () => {
    const { evaluateDeterministicGate } = await import('../src/pipeline/deterministic_gate.js');
    const { CodeCheckRegistry } = await import('@deepdive/content');
    const original = CodeCheckRegistry['check_modules_non_empty']!;
    CodeCheckRegistry['check_modules_non_empty'] = () => {
      throw new Error('registry is broken');
    };

    try {
      const result = evaluateDeterministicGate(SddRubric, undefined, undefined, { modules: [] });
      const finding = result.failedFindings.find((f) => f.code === 'INVARIANT_VIOLATED');
      expect(finding?.message).toMatch(/could not run: registry is broken/);
    } finally {
      CodeCheckRegistry['check_modules_non_empty'] = original;
    }
  });

  it('carries the reason through storage so history can explain an old round', () => {
    const round: RoundRecord = {
      id: '123e4567-e89b-12d3-a456-000000000101',
      projectId: 'proj-1',
      phaseId: 'B',
      roundNumber: 1,
      submittedAt: new Date().toISOString(),
      status: 'revise',
    };
    roundRepo.addRound(round);
    roundRepo.addTurn(
      {
        id: '123e4567-e89b-12d3-a456-000000000102',
        roundId: round.id,
        roleId: 'grader',
        verdictStatus: 'revise',
        payloadJson: '{}',
        createdAt: new Date().toISOString(),
      },
      [
        {
          id: '123e4567-e89b-12d3-a456-000000000103',
          code: 'BOUND_VIOLATED',
          severity: 'error',
          targetFieldId: 'sdd_modules_defined',
          message: 'Modules array must not be empty',
        },
      ],
    );

    const [readBack] = roundRepo.getFindingsForTurn('123e4567-e89b-12d3-a456-000000000102');
    expect(readBack?.message).toBe('Modules array must not be empty');
  });
});
