import Database from 'better-sqlite3';
import { MasteryState } from '@deepdive/core';

interface MasteryDbRow {
  concept_id: string;
  attempts_count: number;
  success_count: number;
  last_tested_at: string | null;
  mastered: number;
}

function toState(row: MasteryDbRow): MasteryState {
  return {
    conceptId: row.concept_id,
    attemptsCount: row.attempts_count,
    successCount: row.success_count,
    lastTestedAt: row.last_tested_at ?? undefined,
    mastered: row.mastered === 1,
  };
}

/**
 * Mastery is the one thing here that is genuinely mutable.
 *
 * Rounds and turns are append-only because they are a record of what happened.
 * A mastery state is a running summary of those attempts, not an event, so it
 * is upserted — the attempt history that produced it stays in the quiz rounds.
 */
export class MasteryRepository {
  constructor(private db: Database.Database) {}

  getState(projectId: string, conceptId: string): MasteryState | null {
    const row = this.db
      .prepare(
        'SELECT concept_id, attempts_count, success_count, last_tested_at, mastered FROM mastery_states WHERE project_id = ? AND concept_id = ?',
      )
      .get(projectId, conceptId) as MasteryDbRow | undefined;

    return row ? toState(row) : null;
  }

  getAllStates(projectId: string): MasteryState[] {
    const rows = this.db
      .prepare(
        'SELECT concept_id, attempts_count, success_count, last_tested_at, mastered FROM mastery_states WHERE project_id = ? ORDER BY concept_id ASC',
      )
      .all(projectId) as MasteryDbRow[];

    return rows.map(toState);
  }

  saveState(projectId: string, state: MasteryState): void {
    this.db
      .prepare(
        `INSERT INTO mastery_states (project_id, concept_id, attempts_count, success_count, last_tested_at, mastered)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, concept_id) DO UPDATE SET
           attempts_count = excluded.attempts_count,
           success_count = excluded.success_count,
           last_tested_at = excluded.last_tested_at,
           mastered = excluded.mastered`,
      )
      .run(
        projectId,
        state.conceptId,
        state.attemptsCount,
        state.successCount,
        state.lastTestedAt ?? null,
        state.mastered ? 1 : 0,
      );
  }
}
