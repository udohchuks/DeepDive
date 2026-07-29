# VCS Version Control Port & Implementations

**Package:** @deepdive/vcs  ·  **Build step:** 1.2  ·  **Architecture ref:** §5

## What it does
Provides version control abstraction (`Vcs` port), `GitVcs` for executing real git commands via CLI, and `FakeVcs` for deterministic testing.

## How it works
1. **GitVcs:** Wraps local git execution (`clone`, `checkoutCommit`, `createBranch`, `getDiff`, `commit`, `getHeadCommitSha`, `fileExistsAtCommit`).
2. **FakeVcs:** Re-exported in-memory fake tracking clones, checkouts, branches, and diff outputs without network or CLI execution.

## How to use it
```typescript
import { GitVcs, FakeVcs } from '@deepdive/vcs';

const git = new GitVcs();
const fake = new FakeVcs();
```

## Constraints & gotchas
- `GitVcs` operations require host `git` installed on PATH when running real VCS commands.

## Tests
Covered by `packages/vcs/tests/vcs.test.ts`.

Command: `npm --workspace=packages/vcs run test`
