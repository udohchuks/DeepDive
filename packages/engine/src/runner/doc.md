# Test Runner Integration

**Package:** @deepdive/engine  ·  **Build step:** 5.1  ·  **Architecture ref:** §5

## What it does
Implements the `TestRunner` port from `@deepdive/core`, executing `vitest`, `jest`, `cargo test`, and `pytest`, and converting raw CLI output into structured `TestRunResult` objects.

## How it works
1. **Direct execution:** `LocalTestRunner` runs the command with `execFile` — an argv array, no shell, so no part of a command string can be reinterpreted.
2. **A failing suite is a result, not an error:** test commands exit non-zero when tests fail, which is the normal case here, so a non-zero exit still yields its captured output to the parser. Only a spawn failure produces nothing.
3. **Output parser:** `parseTestOutput` turns framework-specific stdout/stderr into `passCount`, `failCount`, and failing-suite arrays.
4. **P-5 protected invariant:** test results are authoritative ground truth. This module contains **zero model provider calls**.

## How to use it
```typescript
import { LocalTestRunner } from '@deepdive/engine';

const runner = new LocalTestRunner();
const result = await runner.runTests('vitest', '/repo');
```

## Constraints & gotchas
- **This runs the suite directly, with no OS sandbox.** For a student's own project that is code they wrote and would run themselves, so requiring an isolation facility to run it added an install step without a matching risk.
- That reasoning does **not** extend to Codebase Onboarding, where the suite belongs to a cloned third-party repository: `npm install` alone executes a stranger's postinstall scripts, and no per-command approval makes that safe. The `CommandExecutor` is injectable precisely so an isolating executor can be supplied there without changing this class.
- The output parser relies on standard reporter formats (`cargo test`, `vitest`, `pytest`, `jest`).
- The default timeout is 60s per run; `execFile` kills the process on expiry and whatever was captured up to that point is parsed.

## Tests
`packages/engine/tests/test_runner.test.ts` — framework command construction and output parsing, driven through an injected executor so no test spawns a real suite.

Command: `npm --workspace=packages/engine run test`
