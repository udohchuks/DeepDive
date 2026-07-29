import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  initializeGreenfieldWorkspace,
  validatePhaseAArtifact,
  validatePhaseBArtifact,
  GreenfieldDriver,
  GreenfieldGatingEngine,
} from '../src/index.js';

describe('Greenfield Experience Engine & Drivers (Phase 6)', () => {
  const tmpDir = path.join(process.cwd(), 'packages/greenfield/tests/tmp_workspace');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('initializeGreenfieldWorkspace creates .deepdive/config.json file', () => {
    const config = initializeGreenfieldWorkspace(tmpDir, 'proj-1', 'Greenfield Project');
    expect(config.mode).toBe('greenfield');
    expect(config.projectId).toBe('proj-1');

    const configPath = path.join(tmpDir, '.deepdive/config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const savedContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(savedContent.projectName).toBe('Greenfield Project');
  });

  it('validates Phase A charter artifact cleanly', () => {
    const validCharter = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'DeepDive System',
      goal: 'Problem text',
      techStack: ['TypeScript', 'Node'],
      scopeBounds: ['No web UI'],
      coreFeatures: ['CLI Engine'],
      createdAt: new Date().toISOString(),
      version: 1,
    };
    expect(() => validatePhaseAArtifact(validCharter)).not.toThrow();
  });

  it('validates Phase B SDD artifact cleanly', () => {
    const validSdd = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      charterId: '123e4567-e89b-12d3-a456-426614174000',
      title: 'System Design',
      overview: 'Architecture overview',
      modules: [{ id: 'm1', name: 'Core', purpose: 'Storage', dependencies: [] }],
      dataFlows: ['CLI -> Engine'],
      version: 1,
    };
    expect(() => validatePhaseBArtifact(validSdd)).not.toThrow();
  });

  it('drives Greenfield project through phases A -> B -> B.5 -> C -> D -> E -> F (Complete)', () => {
    const driver = new GreenfieldDriver();
    let state = driver.createInitialState();

    expect(state.currentPhase).toBe('A');

    // Phase A -> B
    let res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('B');
    state = res.newState;

    // Phase B -> B.5
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('B.5');
    state = res.newState;

    // Phase B.5 -> C
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('C');
    state = res.newState;

    // Phase C -> D
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('D');
    state = res.newState;

    // Phase D -> E
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('E');
    state = res.newState;

    // Phase E -> F (Terminal Completion Phase)
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('F');
    expect(res.newState.isComplete).toBe(true);
  });

  it('PROTECTED INVARIANT: Unbounded Rounds — accepts high round numbers without numeric capping (architecture.md §7)', () => {
    const engine = new GreenfieldGatingEngine();
    const highRoundState = {
      currentPhase: 'D' as const,
      roundCount: 1500, // 1,500 rounds (Unbounded Rounds)
      mode: 'greenfield' as const,
      isComplete: false,
    };

    const result = engine.advancePhase(highRoundState, true);
    expect(result.transitionOccurred).toBe(true);
    expect(result.nextState.currentPhase).toBe('E');
  });

  it('PROTECTED INVARIANT: GreenfieldDriver Unbounded Rounds — increments round count without cap', () => {
    const driver = new GreenfieldDriver();
    let state = driver.createInitialState();
    expect(state.roundCount).toBe(0);

    for (let i = 1; i <= 25; i++) {
      state = driver.processSubmissionVerdict(state, false).newState;
      expect(state.roundCount).toBe(i);
    }
    expect(state.roundCount).toBe(25);
  });
});
