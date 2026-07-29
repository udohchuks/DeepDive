import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

  const dir = migrationsDir ?? path.resolve(process.cwd(), 'packages/storage/src/migrations');
  if (!fs.existsSync(dir)) {
    return;
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
