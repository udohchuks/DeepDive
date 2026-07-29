import Database from 'better-sqlite3';

export function createDbConnection(dbPath = ':memory:'): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
