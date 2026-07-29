# Onboarding Experience Engine & Drivers

**Package:** @deepdive/onboarding  ·  **Build step:** 7.1, 7.2, 7.3  ·  **Architecture ref:** §8

## What it does
Provides workspace initialization with target commit SHA pinning (`.deepdive/config.json`), artifact validators for onboarding phases OB-A through OB-G (`RepoLearningCharter`, `RSDD`, `CDD`, `CompletionRecord`), citation verification via `Vcs` port, and onboarding lifecycle driver (`OnboardingDriver`).

## How it works
1. **Repo Discovery & Commit Pinning (Step 7.1):** `initializeOnboardingWorkspace` fetches and pins the target repository's git commit SHA using the `Vcs` port.
2. **Reverse System Design & Citation Verification (Step 7.2):** `validateAndVerifyPhaseObBArtifact` validates RSDD schemas and verifies that cited module files exist at the pinned commit SHA.
3. **Onboarding Lifecycle Engine (Step 7.3):** Drives transitions across onboarding phases OB-A -> OB-B -> OB-C -> OB-D -> OB-E -> OB-F -> OB-G -> Complete.

## How to use it
```typescript
import { initializeOnboardingWorkspace, OnboardingDriver } from '@deepdive/onboarding';
import { FakeVcs } from '@deepdive/core';

const vcs = new FakeVcs();
const config = await initializeOnboardingWorkspace('/repo', 'proj-ob-1', 'https://github.com/org/repo.git', vcs);

const driver = new OnboardingDriver();
let state = driver.createInitialState();
const result = driver.processSubmissionVerdict(state, true);
```

## Constraints & gotchas
- Every RSDD module citation must resolve to an actual file in the pinned target repository commit.

## Tests
Covered by `packages/onboarding/tests/onboarding.test.ts`.

Command: `npm --workspace=packages/onboarding run test`
