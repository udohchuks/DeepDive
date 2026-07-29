import Database from 'better-sqlite3';
import { Hint, HintLevel } from '@deepdive/core';

interface HintDbRow {
  id: string;
  turn_id: string;
  level: HintLevel;
  content: string;
  revealed_at: string;
}

export class HintRepository {
  constructor(private db: Database.Database) {}

  saveHint(hint: Hint): void {
    this.db
      .prepare(
        'INSERT INTO hints (id, turn_id, level, content, revealed_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(hint.id, hint.turnId, hint.level, hint.content, hint.revealedAt);
  }

  getHintsForTurn(turnId: string): Hint[] {
    const rows = this.db
      .prepare(
        'SELECT id, turn_id, level, content, revealed_at FROM hints WHERE turn_id = ? ORDER BY level ASC, revealed_at ASC',
      )
      .all(turnId) as HintDbRow[];

    return rows.map((r) => ({
      id: r.id,
      turnId: r.turn_id,
      level: r.level,
      content: r.content,
      revealedAt: r.revealed_at,
    }));
  }
}
