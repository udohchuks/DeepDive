# Path & Command Policy

**Package:** @deepdive/policy  ·  **Build step:** 2.x  ·  **Architecture ref:** §3, §4

## What it does
Decides which paths a role may read or write (`PathPolicyEvaluator`) and whether a shell command mutates state (`classifyCommand`). These are the in-process checks the agent tool gate consults before any tool runs.

## How it works
1. **Path scoping:** `PathPolicyEvaluator` takes a `PathPolicy` (`readOnlyPaths`, `readWritePaths`, `blockedPaths`) and answers read/write questions about a target. Paths are canonicalized before matching, so `../` traversal and symlinks cannot be used to escape a boundary — a policy comparing raw strings would be trivially bypassed.
2. **Blocked wins:** a path inside a blocked directory is denied even when it also sits inside a read-write root. This is what stops the Scaffolder writing a graded artifact that lives in the student's own workspace (P-2).
3. **Command classification:** `classifyCommand` reports whether a command is read-only. The Verifier is refused anything that is not, which is how "read-only role" gets enforced for `bash`, where the tool name alone tells you nothing.

## How to use it
```typescript
import { PathPolicyEvaluator, classifyCommand } from '@deepdive/policy';

const evaluator = new PathPolicyEvaluator({
  readOnlyPaths: ['/workspace'],
  readWritePaths: ['/workspace/tests'],
  blockedPaths: ['/workspace/sdd.json'],
});

evaluator.evaluateWriteAccess('/workspace/tests/queue.test.ts'); // allowed
evaluator.evaluateWriteAccess('/workspace/sdd.json');            // blocked (P-2)

classifyCommand('git status').isReadOnly; // true
classifyCommand('rm -rf /').isReadOnly;   // false
```

## Constraints & gotchas
- **This package no longer performs OS-level sandboxing.** It previously also held bubblewrap, Seatbelt and WSL2 wrappers plus a platform preflight; those were removed along with the requirement to install an isolation facility before running DeepDive. Editing your own project is authorised the way Claude Code authorises it — this policy, plus per-command approval.
- It was named `@deepdive/sandbox`, and `PathPolicy` was named `MountPolicy`, because both described bind mounts. Both are now named for what they actually are: in-process access checks.
- These checks are **advisory to a cooperating caller**. They constrain the agent's own tools, not arbitrary code that is already executing. Running a third-party repository's test suite is therefore out of scope here and would want real isolation — see `packages/engine/src/runner/doc.md`.
- Canonicalization touches the filesystem, so a path under a directory that does not exist yet resolves against its nearest existing ancestor.

## Tests
`packages/policy/tests/policy.test.ts` — read/write/blocked resolution, traversal escape attempts, and command classification.

PROTECTED INVARIANT tests: a blocked path is denied even inside a read-write root; `../` traversal cannot escape a boundary.

Command: `npm --workspace=packages/policy run test`
