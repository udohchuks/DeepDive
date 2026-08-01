import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Locates the migration SQL relative to this module.
 *
 * The default used to be `<cwd>/packages/storage/src/migrations`, which only
 * resolved when the process happened to start at the repo root. Any consumer
 * run from elsewhere — the `deepdive` CLI in a student's project, for instance
 * — silently found no directory and applied no migrations, then failed later
 * with "no such table". Resolving from the module means the answer does not
 * depend on where the process was launched.
 *
 * Both layouts are checked because `tsc` does not copy `.sql` into `dist`: when
 * built, the files still live in the sibling `src` tree.
 */
export function resolveMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [here, path.resolve(here, '../../src/migrations')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.readdirSync(candidate).some((f) => f.endsWith('.sql'))) {
      return candidate;
    }
  }

  return here;
}

export class MigrationChecksumMismatchError extends Error {
  constructor(public version: number, public expectedHash: string, public actualHash: string) {
    super(
      `Migration checksum mismatch for version ${version}! Expected ${expectedHash}, found ${actualHash}. Applied migrations cannot be modified.`,
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

export class UnversionedMigrationError extends Error {
  constructor(filename: string) {
    super(
      `Migration "${filename}" does not start with a numeric version (e.g. 004_add_column.sql). Versions are read from the filename, not from sort position.`,
    );
    this.name = 'UnversionedMigrationError';
  }
}

export class DuplicateMigrationVersionError extends Error {
  constructor(version: number, first: string, second: string) {
    super(`Migration version ${version} is claimed by both "${first}" and "${second}".`);
    this.name = 'DuplicateMigrationVersionError';
  }
}

/**
 * Reads a migration's version from its filename prefix.
 *
 * The version used to be the file's index in sorted order, which made the
 * `001_`/`002_` prefixes decorative. Adding a migration that sorts before an
 * existing one — or renaming one — renumbered every migration after it, so an
 * already-applied file was compared against a different file's checksum and a
 * correct database failed to open with a mismatch. Reading the number the
 * author wrote means a file's identity does not depend on its neighbours.
 */
export function parseMigrationVersion(filename: string): number {
  const match = /^(\d+)/.exec(filename);
  if (!match) {
    throw new UnversionedMigrationError(filename);
  }
  return Number.parseInt(match[1], 10);
}

export function runMigrations(db: Database.Database, migrationsDir?: string): void {
  // Ensure _migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const dir = migrationsDir ?? resolveMigrationsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Migrations directory not found: ${dir}. The storage package is installed incorrectly.`,
    );
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const versioned = files.map((filename) => ({ filename, version: parseMigrationVersion(filename) }));

  // A repeated version would make the applied-set ambiguous: one of the two
  // files would be recorded and the other silently skipped forever.
  const seen = new Map<number, string>();
  for (const { filename, version } of versioned) {
    const clash = seen.get(version);
    if (clash) {
      throw new DuplicateMigrationVersionError(version, clash, filename);
    }
    seen.set(version, filename);
  }
  versioned.sort((a, b) => a.version - b.version);

  const appliedRows = db.prepare('SELECT version, filename, checksum FROM _migrations ORDER BY version ASC').all() as {
    version: number;
    filename: string;
    checksum: string;
  }[];

  const appliedMap = new Map<number, { filename: string; checksum: string }>();
  for (const row of appliedRows) {
    appliedMap.set(row.version, row);
  }

  for (const { filename, version } of versioned) {
    const filePath = path.join(dir, filename);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

    const existing = appliedMap.get(version);
    if (existing) {
      if (existing.checksum !== checksum) {
        throw new MigrationChecksumMismatchError(version, existing.checksum, checksum);
      }
      continue; // Idempotent skip
    }

    // Apply new migration inside a transaction
    db.transaction(() => {
      db.exec(sqlContent);
      db.prepare('INSERT INTO _migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(
        version,
        filename,
        checksum,
        new Date().toISOString(),
      );
    })();
  }
}
