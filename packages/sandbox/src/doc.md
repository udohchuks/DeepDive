# Sandbox & Isolation Policy

**Package:** @deepdive/sandbox  ·  **Build step:** 2.1, 2.2  ·  **Architecture ref:** §5

## What it does
Provides platform preflight detection, OS-native process sandbox wrappers (`bubblewrap` on Linux, `sandbox-exec` on macOS, WSL2 on Windows), path canonicalization policy evaluation, and command read-only/mutating classification.

## How it works
`runPreflight()` probes host capabilities. Windows without WSL2 returns `windows-blocked` with actionable remediation text. `createSandboxWrapper()` returns the appropriate OS wrapper for supported platforms and throws `UnsandboxedExecutionBlockedError` if preflight is unsupported, ensuring no unsandboxed fallback path exists.

`PathPolicyEvaluator` canonicalizes target paths (resolving `../` traversal and symlink escapes) and checks against read-only, read-write, and explicitly blocked path policies. `classifyCommand` categorizes CLI invocations into read-only vs mutating operations.

## How to use it
```typescript
import { runPreflight, createSandboxWrapper, PathPolicyEvaluator } from '@deepdive/sandbox';

const preflight = runPreflight();
if (!preflight.isSupported) {
  console.error(preflight.remediationText);
} else {
  const wrapper = createSandboxWrapper(preflight);
}

const evaluator = new PathPolicyEvaluator({
  readOnlyPaths: ['/repo'],
  readWritePaths: ['/repo/tests'],
  blockedPaths: ['/etc'],
});
const check = evaluator.evaluateWriteAccess('/repo/tests/unit.test.ts');
```

## Constraints & gotchas
- Windows without WSL2 is a hard block — no unsandboxed fallback is permitted.
- `PathPolicyEvaluator` requires path canonicalization before matching to prevent symlink escape attacks.

## Tests
Covered by `packages/sandbox/tests/preflight.test.ts`, `packages/sandbox/tests/policy.test.ts`, and `packages/sandbox/tests/isolation.test.ts`.

Command: `npm --workspace=packages/sandbox run test`
