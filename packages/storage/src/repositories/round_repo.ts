import Database from 'better-sqlite3';
import { Finding, FindingCode, FindingSeverity } from '@deepdive/core';

export interface RoundRecord {
  id: string;
  projectId: string;
  phaseId: string;
  roundNumber: number;
  submittedAt: string;
  status: string;
}

export interface TurnRecord {
  id: string;
  roundId: string;
  roleId: string;
  verdictStatus: string;
  payloadJson: string;
  createdAt: string;
}

interface RoundDbRow {
  id: string;
  project_id: string;
  phase_id: string;
  round_number: number;
  submitted_at: string;
  status: string;
}

interface TurnDbRow {
  id: string;
  round_id: string;
  role_id: string;
  verdict_status: string;
  payload_json: string;
  created_at: string;
}

interface FindingDbRow {
  id: string;
  code: FindingCode;
  severity: FindingSeverity;
  target_field_id: string;
  message: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  pass_count: number | null;
  fail_count: number | null;
}

export class AppendOnlyViolationError extends Error {
  constructor(entity: string) {
    super(`${entity} is append-only! Update and delete operations are forbidden.`);
    this.name = 'AppendOnlyViolationError';
  }
}

export class RoundRepository {
  constructor(private db: Database.Database) {}

  addRound(round: RoundRecord): void {
    this.db
      .prepare(
        'INSERT INTO rounds (id, project_id, phase_id, round_number, submitted_at, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(round.id, round.projectId, round.phaseId, round.roundNumber, round.submittedAt, round.status);
  }

  addTurn(turn: TurnRecord, findings: Finding[] = []): void {
    const insertTurn = this.db.prepare(
      'INSERT INTO turns (id, round_id, role_id, verdict_status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const insertFinding = this.db.prepare(
      'INSERT INTO findings (id, turn_id, code, severity, target_field_id, message, file_path, line_start, line_end, pass_count, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );

    this.db.transaction(() => {
      insertTurn.run(turn.id, turn.roundId, turn.roleId, turn.verdictStatus, turn.payloadJson, turn.createdAt);
      for (const f of findings) {
        insertFinding.run(
          f.id,
          turn.id,
          f.code,
          f.severity,
          f.targetFieldId,
          f.message ?? null,
          f.filePath ?? null,
          f.lineStart ?? null,
          f.lineEnd ?? null,
          f.passCount ?? null,
          f.failCount ?? null,
        );
      }
    })();
  }

  updateRound(): never {
    throw new AppendOnlyViolationError('Round');
  }

  deleteRound(): never {
    throw new AppendOnlyViolationError('Round');
  }

  updateTurn(): never {
    throw new AppendOnlyViolationError('Turn');
  }

  deleteTurn(): never {
    throw new AppendOnlyViolationError('Turn');
  }

  getRounds(projectId: string): RoundRecord[] {
    const rows = this.db
      .prepare(
        'SELECT id, project_id, phase_id, round_number, submitted_at, status FROM rounds WHERE project_id = ? ORDER BY round_number ASC',
      )
      .all(projectId) as RoundDbRow[];

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      phaseId: r.phase_id,
      roundNumber: r.round_number,
      submittedAt: r.submitted_at,
      status: r.status,
    }));
  }

  getTurnsForRound(roundId: string): TurnRecord[] {
    const rows = this.db
      .prepare(
        'SELECT id, round_id, role_id, verdict_status, payload_json, created_at FROM turns WHERE round_id = ? ORDER BY created_at ASC',
      )
      .all(roundId) as TurnDbRow[];

    return rows.map((t) => ({
      id: t.id,
      roundId: t.round_id,
      roleId: t.role_id,
      verdictStatus: t.verdict_status,
      payloadJson: t.payload_json,
      createdAt: t.created_at,
    }));
  }

  getFindingsForTurn(turnId: string): Finding[] {
    const rows = this.db
      .prepare(
        'SELECT id, code, severity, target_field_id, message, file_path, line_start, line_end, pass_count, fail_count FROM findings WHERE turn_id = ? ORDER BY id ASC',
      )
      .all(turnId) as FindingDbRow[];

    return rows.map((f) => ({
      id: f.id,
      code: f.code,
      severity: f.severity,
      targetFieldId: f.target_field_id,
      // Rounds recorded before the message column existed read back as
      // undefined rather than an empty string, so a caller can tell "no reason
      // was captured" from "the reason was blank".
      message: f.message ?? undefined,
      filePath: f.file_path ?? undefined,
      lineStart: f.line_start ?? undefined,
      lineEnd: f.line_end ?? undefined,
      passCount: f.pass_count ?? undefined,
      failCount: f.fail_count ?? undefined,
    }));
  }
}
