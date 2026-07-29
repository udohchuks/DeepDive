# Model Provider Abstraction

**Package:** @deepdive/provider  ·  **Build step:** 2.3  ·  **Architecture ref:** §9b

## What it does
Provides BYO-key model provider integration (`AnthropicModelProvider`), structured model execution with strict Zod validation, and content-addressed fixture replay (`RecordedFixtureProvider`) for deterministic offline test execution.

## How it works
Model calls enforce determinism controls D-2, D-4, and D-5:
1. **Forced Temperature 0 & Pinned Version (D-2, D-5):** Requests force `temperature: 0` and use explicit model strings (`claude-3-5-sonnet-20241022`), never `-latest` aliases.
2. **Strict Zod Validation & 2 Retries (D-2):** Responses are validated through Zod schemas. On validation failure, execution retries at most twice before throwing `StructuredOutputValidationError`. Invalid model outputs are **never coerced or salvaged**.
3. **Content-Addressed Fixture Store (D-4):** `RecordedFixtureProvider` keys requests by `hash(role, promptVersion, input)`. Cache misses result in a hard `FixtureCacheMissError` printing the missing key, ensuring tests never hit external network APIs.

## How to use it
```typescript
import { RecordedFixtureProvider, AnthropicModelProvider } from '@deepdive/provider';
import { z } from 'zod';

const provider = new RecordedFixtureProvider();
provider.registerFixture('grader', 'v1', 'input', { verdict: 'approved' });

const result = await provider.generateStructured({
  role: 'grader',
  promptVersion: 'v1',
  systemPrompt: 'System',
  userPrompt: 'input',
  schema: z.object({ verdict: z.string() }),
});
```

## Constraints & gotchas
- Missing API keys throw `MissingApiKeyError` without logging or leaking credentials.
- In test mode, fixture cache misses throw hard errors; no fallback live calls occur.

## Tests
Covered by `packages/provider/tests/provider.test.ts`, asserting pinned model versioning, missing API key handling, max 2 retry enforcement, and fixture cache miss errors.

Command: `npm --workspace=packages/provider run test`
