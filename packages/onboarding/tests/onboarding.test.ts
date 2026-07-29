import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FakeVcs } from '@deepdive/core';
import {
  initializeOnboardingWorkspace,
  validatePhaseObAArtifact,
  validateAndVerifyPhaseObBArtifact,
  OnboardingDriver,
} from '../src/index.js';

describe('Onboarding Experience Engine & Drivers (Phase 7)', () => {
  const tmpDir = path.join(process.cwd(), 'packages/onboarding/tests/tmp_workspace');
  let vcs: FakeVcs;

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vcs = new FakeVcs();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('initializeOnboardingWorkspace creates .deepdive/config.json and pins commit SHA via Vcs port', async () => {
    const config = await initializeOnboardingWorkspace(
      tmpDir,
      'proj-ob-1',
      'https://github.com/example/repo.git',
      vcs,
    );

    expect(config.mode).toBe('onboarding');
    expect(config.projectId).toBe('proj-ob-1');
    expect(config.targetCommitSha).toBe('0000000000000000000000000000000000000000');

    const configPath = path.join(tmpDir, '.deepdive/config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(saved.targetCommitSha).toBe('0000000000000000000000000000000000000000');
  });

  it('validates OB-A Repo Learning Charter artifact cleanly', () => {
    const charter = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      repoName: 'example/repo',
      repoUrl: 'https://github.com/example/repo.git',
      targetCommitSha: '0000000000000000000000000000000000000000',
      intent: 'contribute' as const,
      tier: 'small' as const,
      mvpScope: ['Fix bug #123'],
      createdAt: new Date().toISOString(),
      version: 1,
    };
    expect(() => validatePhaseObAArtifact(charter)).not.toThrow();
  });

  it('validates OB-B RSDD and verifies module file citations via Vcs port', async () => {
    vcs.setFileExistsAtCommit(true);

    const rsddPayload = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      charterId: '123e4567-e89b-12d3-a456-426614174000',
      repoName: 'example/repo',
      targetCommitSha: '0000000000000000000000000000000000000000',
      level: 'L3' as const,
      modules: [
        {
          id: 'm1',
          name: 'Engine',
          purpose: 'Orchestration',
          dependencies: [],
          citations: [{ filePath: 'src/main.ts', lineStart: 1, lineEnd: 50 }],
        },
      ],
      architectureSummary: 'System architecture summary',
      version: 1,
    };

    const res = await validateAndVerifyPhaseObBArtifact(rsddPayload, tmpDir, vcs);
    expect(res.rsdd.level).toBe('L3');
    expect(res.citationsValid).toBe(true);
  });

  it('drives Onboarding project through phases OB-A -> OB-B -> OB-C -> OB-D -> OB-E -> OB-F -> OB-G (Complete)', () => {
    const driver = new OnboardingDriver();
    let state = driver.createInitialState();

    expect(state.currentPhase).toBe('OB-A');

    // OB-A -> OB-B
    let res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-B');
    state = res.newState;

    // OB-B -> OB-C
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-C');
    state = res.newState;

    // OB-C -> OB-D
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-D');
    state = res.newState;

    // OB-D -> OB-E
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-E');
    state = res.newState;

    // OB-E -> OB-F
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-F');
    state = res.newState;

    // OB-F -> OB-G (Terminal Completion Phase)
    res = driver.processSubmissionVerdict(state, true);
    expect(res.transitionOccurred).toBe(true);
    expect(res.newState.currentPhase).toBe('OB-G');
    expect(res.newState.isComplete).toBe(true);
  });
});
