import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createDbConnection,
  runMigrations,
  ProjectRepository,
  ArtifactRepository,
  RoundRepository,
  HintRepository,
  QuizRepository,
  AppendOnlyViolationError,
} from '../src/index.js';
import { Finding } from '@deepdive/core';

describe('Typed SQLite Repositories & Determinism (Phase 1.4)', () => {
  let db: Database.Database;
  let projectRepo: ProjectRepository;
  let artifactRepo: ArtifactRepository;
  let roundRepo: RoundRepository;
  let hintRepo: HintRepository;
  let quizRepo: QuizRepository;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    runMigrations(db);
    projectRepo = new ProjectRepository(db);
    artifactRepo = new ArtifactRepository(db);
    roundRepo = new RoundRepository(db);
    hintRepo = new HintRepository(db);
    quizRepo = new QuizRepository(db);
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('ProjectRepository: creates and retrieves projects and phase states', () => {
    const project = {
      id: 'p1',
      name: 'Test Project',
      mode: 'greenfield' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const initialState = {
      currentPhase: 'A' as const,
      roundCount: 1,
      mode: 'greenfield' as const,
      isComplete: false,
    };

    projectRepo.createProject(project, initialState);

    const fetchedProject = projectRepo.getProject('p1');
    expect(fetchedProject).toEqual(project);

    const fetchedState = projectRepo.getPhaseState('p1');
    expect(fetchedState).toEqual(initialState);

    // Update phase state
    const nextState = { ...initialState, currentPhase: 'B' as const, roundCount: 2 };
    projectRepo.updatePhaseState('p1', nextState, new Date().toISOString());
    expect(projectRepo.getPhaseState('p1')).toEqual(nextState);
  });

  it('ArtifactRepository: handles versioning and detects identical submission hash (D-7)', () => {
    const project = {
      id: 'p1',
      name: 'Test Project',
      mode: 'greenfield' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projectRepo.createProject(project, {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    });

    const content1 = JSON.stringify({ title: 'Draft 1' });
    const art1 = artifactRepo.saveArtifact('art1', 'p1', 'sdd', content1, new Date().toISOString());
    expect(art1.version).toBe(1);

    expect(artifactRepo.hasIdenticalSubmissionHash('p1', 'sdd', content1)).toBe(true);

    const content2 = JSON.stringify({ title: 'Draft 2' });
    const art2 = artifactRepo.saveArtifact('art2', 'p1', 'sdd', content2, new Date().toISOString());
    expect(art2.version).toBe(2);

    const latest = artifactRepo.getLatestArtifact('p1', 'sdd');
    expect(latest?.version).toBe(2);
    expect(latest?.contentJson).toBe(content2);
  });

  it('D-7 & Protected Invariant: RoundRepository rounds and turns reject update/delete (append-only)', () => {
    expect(() => roundRepo.updateRound()).toThrow(AppendOnlyViolationError);
    expect(() => roundRepo.deleteRound()).toThrow(AppendOnlyViolationError);
    expect(() => roundRepo.updateTurn()).toThrow(AppendOnlyViolationError);
    expect(() => roundRepo.deleteTurn()).toThrow(AppendOnlyViolationError);
  });

  it('RoundRepository: persists rounds, turns, and structured findings cleanly', () => {
    const project = {
      id: 'p1',
      name: 'Test Project',
      mode: 'greenfield' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projectRepo.createProject(project, {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    });

    const round = {
      id: 'r1',
      projectId: 'p1',
      phaseId: 'A',
      roundNumber: 1,
      submittedAt: new Date().toISOString(),
      status: 'revise',
    };
    roundRepo.addRound(round);

    const turn = {
      id: 't1',
      roundId: 'r1',
      roleId: 'grader',
      verdictStatus: 'revise',
      payloadJson: JSON.stringify({ status: 'revise' }),
      createdAt: new Date().toISOString(),
    };

    const finding: Finding = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      code: 'CITATION_MISSING',
      severity: 'error',
      targetFieldId: 'sdd.modules[0]',
      filePath: 'src/main.ts',
      lineStart: 1,
      lineEnd: 5,
    };

    roundRepo.addTurn(turn, [finding]);

    const fetchedRounds = roundRepo.getRounds('p1');
    expect(fetchedRounds).toHaveLength(1);
    expect(fetchedRounds[0]).toEqual(round);

    const fetchedTurns = roundRepo.getTurnsForRound('r1');
    expect(fetchedTurns).toHaveLength(1);
    expect(fetchedTurns[0]).toEqual(turn);

    const fetchedFindings = roundRepo.getFindingsForTurn('t1');
    expect(fetchedFindings).toHaveLength(1);
    expect(fetchedFindings[0]).toEqual(finding);
  });

  it('D-7: queries maintain stable explicit ORDER BY ordering under shuffled insertions', () => {
    const project = {
      id: 'p1',
      name: 'Test Project',
      mode: 'greenfield' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projectRepo.createProject(project, {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    });

    // Insert rounds out of order
    roundRepo.addRound({ id: 'r3', projectId: 'p1', phaseId: 'A', roundNumber: 3, submittedAt: '2026-01-03', status: 'approved' });
    roundRepo.addRound({ id: 'r1', projectId: 'p1', phaseId: 'A', roundNumber: 1, submittedAt: '2026-01-01', status: 'revise' });
    roundRepo.addRound({ id: 'r2', projectId: 'p1', phaseId: 'A', roundNumber: 2, submittedAt: '2026-01-02', status: 'revise' });

    const rounds = roundRepo.getRounds('p1');
    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
  });

  it('HintRepository & QuizRepository: store and retrieve hints, quizzes, and completion records', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174099';
    const project = {
      id: projectId,
      name: 'Test Project',
      mode: 'greenfield' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projectRepo.createProject(project, {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    });

    roundRepo.addRound({ id: 'r1', projectId, phaseId: 'A', roundNumber: 1, submittedAt: '2026-01-01', status: 'revise' });
    roundRepo.addTurn({ id: 't1', roundId: 'r1', roleId: 'grader', verdictStatus: 'revise', payloadJson: '{}', createdAt: '2026-01-01' });

    const hint = {
      id: '123e4567-e89b-12d3-a456-426614174006',
      turnId: 't1',
      level: 'L1' as const,
      content: 'Orientation hint',
      revealedAt: new Date().toISOString(),
    };
    hintRepo.saveHint(hint);

    const hints = hintRepo.getHintsForTurn('t1');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toEqual(hint);

    const quiz = {
      id: 'q1',
      conceptId: 'c1',
      type: 'multiple_choice' as const,
      question: 'Q1?',
      options: ['A', 'B'],
      correctAnswer: 'A',
      explanation: 'Exp',
    };
    quizRepo.saveQuizItem(projectId, quiz);
    expect(quizRepo.getQuizzesForProject(projectId)).toHaveLength(1);

    const completionRecord = {
      id: '123e4567-e89b-12d3-a456-426614174008',
      projectId,
      mode: 'greenfield' as const,
      charterTitle: 'Test Project',
      completedPhases: ['A' as const, 'F' as const],
      hintProfile: [],
      completedAt: new Date().toISOString(),
      contentHash: 'a'.repeat(64),
    };
    quizRepo.saveCompletionRecord(completionRecord);
    const fetchedRecord = quizRepo.getCompletionRecord(projectId);
    expect(fetchedRecord).toEqual(completionRecord);
  });
});
