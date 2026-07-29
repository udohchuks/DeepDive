# Service Interfaces & Ports

**Package:** @deepdive/core  ·  **Build step:** 1.2  ·  **Architecture ref:** §2, §5, §6, §12

## What it does
Declares abstract service port interfaces (`ModelProvider`, `HintService`, `TestRunner`, `Vcs`, `Clock`, `IdGenerator`) and exports in-memory deterministic fakes for test execution.

## How it works
By defining service ports in `@deepdive/core`, earlier packages and the orchestration engine depend strictly on contracts rather than concrete implementations. This decouples component dependencies (e.g. pipeline ↔ hints ordering) and guarantees that all test execution can run offline against content-addressed fakes.

The `Clock` and `IdGenerator` ports enforce determinism control D-3: no application module calls `Date.now()`, `Math.random()`, or `crypto.randomUUID()` directly. Production wiring uses `SystemClock` and `CryptoIdGenerator`, while tests inject `FixedClock` and `FixedIdGenerator`.

## How to use it
```typescript
import { FixedClock, FixedIdGenerator, FakeModelProvider } from '@deepdive/core';

const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
const idGen = new FixedIdGenerator('test-id');
const modelProvider = new FakeModelProvider();

modelProvider.setResponse('grader', 'v1', { verdict: 'approved' });
```

## Constraints & gotchas
- Direct calls to `Date.now()`, `Math.random()`, or `crypto.randomUUID()` outside `clock.ts` are strictly forbidden by a lint assertion in `ports.test.ts`.

## Tests
Covered by `packages/core/tests/ports.test.ts`, asserting interface conformance for all fakes and running the ambient time/randomness lint rule.

Command: `npm --workspace=packages/core run test`
