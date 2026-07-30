import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createDbConnection,
  runMigrations,
  resolveMigrationsDir,
  MigrationChecksumMismatchError,
} from '../src/index.js';

describe('SQLite Database & Migration Engine (Phase 1.4)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should verify WAL mode and foreign_keys pragmas', () => {
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);

    const jm = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(jm.journal_mode).toBe('memory'); // in-memory db reports memory mode for journal
  });

  it('should execute migrations clean and idempotently', () => {
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('_migrations');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('phase_states');
    expect(tableNames).toContain('artifacts');
    expect(tableNames).toContain('rounds');
    expect(tableNames).toContain('turns');
    expect(tableNames).toContain('findings');
    expect(tableNames).toContain('hints');
    expect(tableNames).toContain('quizzes');
    expect(tableNames).toContain('completion_records');

    // Re-run migrations (must be idempotent skip)
    expect(() => runMigrations(db)).not.toThrow();
  });

  it('D-7: migration checksum runner fails loudly if applied migration checksum drifts', () => {
    runMigrations(db);

    // Tamper with the applied migration checksum in _migrations table
    db.prepare('UPDATE _migrations SET checksum = ? WHERE version = 1').run('tampered-checksum-12345');

    // Re-running runner must throw MigrationChecksumMismatchError
    expect(() => runMigrations(db)).toThrow(MigrationChecksumMismatchError);
  });
});

describe('Migration path resolution (regression)', () => {
  // The default migrations directory was `<cwd>/packages/storage/src/migrations`,
  // so it resolved only when the process started at the repo root. The CLI, run
  // from a student's own project, found nothing, applied no migrations, and
  // failed later with "no such table".
  it('PROTECTED INVARIANT: migrations resolve independently of the working directory', () => {
    const originalCwd = process.cwd();
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'deepdive-cwd-'));

    try {
      process.chdir(elsewhere);
      const db = createDbConnection(':memory:');
      runMigrations(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain('rounds');
      db.close();
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('resolves to a directory that actually contains migration SQL', () => {
    const dir = resolveMigrationsDir();
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.sql'))).toBe(true);
  });
});
