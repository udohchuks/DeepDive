# Test Runner Integration

**Package:** @deepdive/engine  ·  **Build step:** 5.1  ·  **Architecture ref:** §5

## What it does
Implements the `TestRunner` port from `@deepdive/core`, executing `vitest`, `jest`, `cargo test`, and `pytest` under OS sandbox wrappers (`@deepdive/sandbox`). Converts raw CLI output into structured `TestRunResult` objects.

## How it works
1. **Sandboxed Execution:** Invocations pass through `SandboxWrapper`, running in isolated processes.
2. **Output Parser:** `parseTestOutput` parses framework-specific stdout/stderr into `passCount`, `failCount`, and failing test suite arrays.
3. **P-5 Protected Invariant:** Test results are authoritative ground truth. This module contains **zero model provider calls**.

## How to use it
```typescript
import { SandboxedTestRunner } from '@deepdive/engine';
import { createSandboxWrapper, runPreflight } from '@deepdive/sandbox';

const wrapper = createSandboxWrapper(runPreflight());
const runner = new SandboxedTestRunner(wrapper);
const result = await runner.runTests('vitest', '/repo');
```

## Constraints & gotchas
- Test runner output parser relies on standard reporter formats (`cargo test`, `vitest`, `pytest`, `jest`).

## Tests
Covered by `packages/engine/tests/test_runner.test.ts`.

Command: `npm --workspace=packages/engine run test`
