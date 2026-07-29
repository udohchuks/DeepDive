# pi Agent Harness & Role Sessions

**Package:** @deepdive/agent  ·  **Build step:** 3.0, 3.1, 3.2, 3.3  ·  **Architecture ref:** §2, §3, §4, §6

## What it does
Implements the pi SDK agent harness (`createAgentSession`), the `tool_call` permission hook, the Dual-LLM quarantine boundary (`Finding` filter), and role-scoped session factories (`Scaffolder`, `Verifier`, `Grader`).

## How it works
1. **SDK Contract (Step 3.0):** Wraps `@earendil-works/pi-coding-agent` session creation with per-role tool allowlists (`tools`, `excludeTools`, `noTools`, `customTools`).
2. **Permission Hook (Step 3.1):** Evaluates path policies (`PathPolicyEvaluator`) and command policies (`classifyCommand`) before tool execution. Fails closed on evaluator errors.
3. **Dual-LLM Quarantine Boundary (Step 3.2):** Verifier observations are transformed into strictly typed `Finding` objects via `FindingSchema`. The `filterAndSanitizeFindings` function strips raw repo text before handing structured findings to the Grader role, preventing prompt injection smuggling (§6).
4. **Role Tool Scoping & P-2 Invariant (Step 3.3):**
   - **Scaffolder:** `write`, `edit`, `bash` scoped to scaffold/test paths. P-2 invariant check blocks writes into graded-artifact paths (`sdd.json`, `rsdd.json`, `cdd.json`).
   - **Verifier:** Read-only tools (`read`, `grep`, `find`, `ls`, read-only `bash`). Cannot mutate workspace or execute mutating shell commands.
   - **Grader:** `noTools: 'all'` with custom verdict tool (`submit_rubric_verdict`). Has no filesystem access by construction.

## How to use it
```typescript
import { buildRoleSession } from '@deepdive/agent';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

const pathEvaluator = new PathPolicyEvaluator({
  readOnlyPaths: ['/workspace'],
  readWritePaths: ['/workspace/tests'],
  blockedPaths: [],
});

const scaffolder = buildRoleSession('scaffolder', pathEvaluator, ['sdd.json']);
const verifier = buildRoleSession('verifier');
const grader = buildRoleSession('grader');
```

## Constraints & gotchas
- Scaffolder writes targeting graded artifact paths (`sdd.json`, `rsdd.json`, `cdd.json`) are blocked by P-2 invariant check.
- Grader session has zero filesystem access.

## Tests
Covered by `packages/agent/tests/sdk_contract.test.ts`, `packages/agent/tests/permission_hook.test.ts`, `packages/agent/tests/quarantine.test.ts`, and `packages/agent/tests/role_sessions.test.ts`.

Command: `npm --workspace=packages/agent run test`
