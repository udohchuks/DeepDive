# Role Session Factory

**Package:** @deepdive/agent  ·  **Build step:** 3.3  ·  **Architecture ref:** §3

## What it does
Provides role-scoped session factories for `Scaffolder`, `Verifier`, and `Grader` agent roles.

## How it works
Configures pi SDK sessions with role-specific tool matrices:
- Scaffolder: `write`, `edit`, `bash` (scoped to non-graded paths).
- Verifier: `read`, `grep`, `find`, `ls`, `bash` (read-only).
- Grader: `noTools: 'all'` with `submit_rubric_verdict`.

## How to use it
```typescript
import { buildRoleSession } from '@deepdive/agent';
const session = buildRoleSession('verifier');
```

## Constraints & gotchas
- Scaffolder cannot write into graded artifact paths (P-2).

## Tests
Covered by `packages/agent/tests/role_sessions.test.ts`.
