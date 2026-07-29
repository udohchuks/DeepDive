# Greenfield Experience Engine & Drivers

**Package:** @deepdive/greenfield  ·  **Build step:** 6.1, 6.2, 6.3  ·  **Architecture ref:** §7

## What it does
Provides workspace initialization for new Greenfield projects (`.deepdive/config.json`), artifact validators for phases A–F (`Charter`, `SDD`, etc.), gating engine (`GreenfieldGatingEngine`), and full project lifecycle driver (`GreenfieldDriver`).

## How it works
1. **Workspace Initialization (Step 6.1):** `initializeGreenfieldWorkspace` creates `.deepdive/config.json` containing mode, project ID, and creation timestamp.
2. **Gating Engine & Transitions (Step 6.2):** `GreenfieldGatingEngine` evaluates phase exit conditions and drives state transitions across Greenfield phases A -> B -> C -> D -> E -> F -> Complete.
3. **Unbounded Rounds Invariant (architecture.md §7):** The engine accepts arbitrary round counts without numeric capping or forced failure.

## How to use it
```typescript
import { initializeGreenfieldWorkspace, GreenfieldDriver } from '@deepdive/greenfield';

const config = initializeGreenfieldWorkspace('/path/to/repo', 'proj-1', 'My App');
const driver = new GreenfieldDriver();
let state = driver.createInitialState();
const result = driver.processSubmissionVerdict(state, true);
```

## Constraints & gotchas
- Greenfield projects strictly follow the A–F phase progression.

## Tests
Covered by `packages/greenfield/tests/greenfield.test.ts`.

Command: `npm --workspace=packages/greenfield run test`
