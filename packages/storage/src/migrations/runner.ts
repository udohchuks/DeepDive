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

  const appliedRows = db.prepare('SELECT version, filename, checksum FROM _migrations ORDER BY version ASC').all() as {
    version: number;
    filename: string;
    checksum: string;
  }[];

  const appliedMap = new Map<number, { filename: string; checksum: string }>();
  for (const row of appliedRows) {
    appliedMap.set(row.version, row);
  }

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const version = i + 1;
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
