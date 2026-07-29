# SQLite Storage Layer

**Package:** @deepdive/storage  ·  **Build step:** 1.4  ·  **Architecture ref:** §7, §9c

## What it does
Provides embedded, local-only SQLite persistence for projects, phase state, artifacts, append-only review rounds and turns, findings, hint reveal logs, quizzes, and completion records.

## How it works
Uses `better-sqlite3` in WAL mode with foreign keys enabled (`PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`).

Key architectural invariants upheld:
1. **Append-Only History (D-7):** `rounds` and `turns` are append-only. Corrections produce new rows; `updateRound()`, `deleteRound()`, `updateTurn()`, and `deleteTurn()` explicitly throw `AppendOnlyViolationError`.
2. **Checksummed Migrations (D-7):** Migration engine stores SHA-256 checksums of applied `.sql` migrations in `_migrations`. Modifying an applied migration throws `MigrationChecksumMismatchError` on startup.
3. **Stable Deterministic Query Ordering (D-7):** Every decision-feeding query includes explicit `ORDER BY` clauses to prevent SQLite row-order non-determinism.
4. **Submission Content Hashing (D-7):** Artifact content SHA-256 hashes are computed and stored to detect identical resubmissions and enable pipeline replay verification.

## How to use it
```typescript
import { createDbConnection, runMigrations, ProjectRepository, RoundRepository } from '@deepdive/storage';

const db = createDbConnection('project.sqlite');
runMigrations(db);

const projectRepo = new ProjectRepository(db);
const roundRepo = new RoundRepository(db);
```

## Constraints & gotchas
- Single-user local file database — no network sync layer.
- `updateRound` and `deleteRound` calls fail at runtime to guarantee turn history immutability.

## Tests
Covered by `packages/storage/tests/db.test.ts` (connection, pragmas, idempotent migrations, checksum drift) and `packages/storage/tests/repositories.test.ts` (typed repository CRUD, append-only invariant, deterministic query ordering, submission content hashing).

Command: `npm --workspace=packages/storage run test`
