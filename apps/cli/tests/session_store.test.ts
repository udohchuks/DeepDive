import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionStore, resolveDbPath } from '../src/session_store.js';
import { Finding } from '@deepdive/core';

const created: string[] = [];

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepdive-store-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length) {
    fs.rmSync(created.pop()!, { recursive: true, force: true });
  }
});

const failingFinding: Finding = {
  id: 'f1',
  code: 'BOUND_VIOLATED',
  severity: 'error',
  targetFieldId: 'charter_title_present',
};

describe('SessionStore persistence', () => {
  it('creates the database beside the project, not in a shared home directory', () => {
    const dir = tempProject();
    const store = new SessionStore({ projectDir: dir });

    expect(store.dbPath).toBe(resolveDbPath(dir));
    expect(fs.existsSync(store.dbPath)).toBe(true);
    store.close();
  });

  it('PROTECTED INVARIANT: rounds survive across separate store instances', () => {
    // The whole point: each CLI invocation is a new process, so history that
    // only lived in memory would be no history at all.
    const dir = tempProject();

    const first = new SessionStore({ projectDir: dir });
    first.recordRound({
      phaseId: 'A',
      status: 'revise',
      artifactType: 'charter',
      artifactPayload: { title: '' },
      findings: [failingFinding],
    });
    first.close();

    const second = new SessionStore({ projectDir: dir });
    const history = second.history();
    second.close();

    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe('revise');
    expect(history[0]!.findings.map((f) => f.code)).toEqual(['BOUND_VIOLATED']);
  });

  it('reuses the existing project id rather than orphaning earlier rounds', () => {
    const dir = tempProject();

    const first = new SessionStore({ projectDir: dir });
    const firstId = first.projectId;
    first.recordRound({
      phaseId: 'A',
      status: 'revise',
      artifactType: 'charter',
      artifactPayload: {},
    });
    first.close();

    const second = new SessionStore({ projectDir: dir });
    // A regenerated id would leave round 1 attached to a project nothing reads,
    // so history would look empty while still occupying the file.
    expect(second.projectId).toBe(firstId);
    expect(second.history()).toHaveLength(1);
    second.close();
  });

  it('numbers rounds consecutively across runs', () => {
    const dir = tempProject();

    for (const status of ['revise', 'revise', 'approved']) {
      const store = new SessionStore({ projectDir: dir });
      store.recordRound({ phaseId: 'A', status, artifactType: 'charter', artifactPayload: {} });
      store.close();
    }

    const store = new SessionStore({ projectDir: dir });
    const history = store.history();
    store.close();

    expect(history.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
    expect(history.map((r) => r.status)).toEqual(['revise', 'revise', 'approved']);
  });

  it('PROTECTED INVARIANT: a resubmission appends rather than overwriting the earlier verdict', () => {
    // Rounds are append-only (§7, unbounded rounds). The rejected attempt is
    // the record of how the student's thinking changed and must not be lost.
    const dir = tempProject();
    const store = new SessionStore({ projectDir: dir });

    store.recordRound({
      phaseId: 'A',
      status: 'revise',
      artifactType: 'charter',
      artifactPayload: { title: '' },
      findings: [failingFinding],
    });
    store.recordRound({
      phaseId: 'A',
      status: 'approved',
      artifactType: 'charter',
      artifactPayload: { title: 'Queue' },
    });

    const history = store.history();
    store.close();

    expect(history).toHaveLength(2);
    expect(history[0]!.status).toBe('revise');
    expect(history[0]!.findings).toHaveLength(1);
  });

  it('reports an empty history for a fresh project rather than failing', () => {
    const dir = tempProject();
    const store = new SessionStore({ projectDir: dir });
    expect(store.history()).toEqual([]);
    store.close();
  });

  it('keeps two projects independent', () => {
    const a = tempProject();
    const b = tempProject();

    const storeA = new SessionStore({ projectDir: a });
    storeA.recordRound({ phaseId: 'A', status: 'approved', artifactType: 'charter', artifactPayload: {} });
    storeA.close();

    const storeB = new SessionStore({ projectDir: b });
    expect(storeB.history()).toEqual([]);
    storeB.close();
  });
});
