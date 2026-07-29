# Model Provider Abstraction

**Package:** @deepdive/provider  ·  **Build step:** 2.3  ·  **Architecture ref:** §9b

## What it does
Provides BYO-key model provider integration (`AnthropicModelProvider`, `DeepSeekModelProvider`, `OpenRouterModelProvider`, `GenericModelProvider`, `createModelProvider`), structured model execution with strict Zod validation, and content-addressed fixture replay (`RecordedFixtureProvider`) for deterministic offline test execution.

## How it works
Model calls enforce determinism controls D-2, D-4, and D-5:

1. **Forced temperature 0 and pinned versions (D-2, D-5):** requests force `temperature: 0` and use explicit model ids (`claude-3-5-sonnet-20241022`, `deepseek-chat`, `anthropic/claude-3.5-sonnet`). `assertPinnedModel` runs at construction and throws `UnpinnedModelError` on any moving alias, including operator-supplied `*_MODEL` overrides — an alias would change the grader between one submission and the next.
2. **Multi-provider support:** `createModelProvider` selects from `MODEL_PROVIDER` (`anthropic`/`claude`, `deepseek`, `openrouter`, or a generic fallback). OpenRouter and DeepSeek are OpenAI-compatible and take a configurable base URL.
3. **Per-provider key isolation:** `EnvironmentKeyStore` reads only the requested provider's own variable. There is deliberately **no cross-provider fallback** — falling back to another vendor's key would transmit that credential to an endpoint it was never issued for. `CLAUDE_API_KEY` is accepted only as an alias for the same Anthropic credential.
4. **Strict Zod validation and 2 retries (D-2):** responses validate through Zod schemas; on failure execution retries at most twice, then throws `StructuredOutputValidationError`. Invalid output is **never coerced or salvaged**.
5. **Content-addressed fixture store (D-4):** `RecordedFixtureProvider` keys requests by `hash(role, promptVersion, input)`. A cache miss throws `FixtureCacheMissError` printing the missing key, so tests never reach the network.

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
- **The provider classes are still wiring, not live integrations.** Every `generateStructured` currently echoes the prompt through `executeStructuredModelCall` rather than issuing an HTTP request. Key resolution, model pinning, validation, and retry semantics are real and tested; the network call is not yet implemented for any provider.
- Setting `MODEL_PROVIDER` to an unrecognized value silently yields `GenericModelProvider`, which looks for `<NAME>_API_KEY`. Check `KNOWN_PROVIDERS` if a typo is suspected.

## Tests
`packages/provider/tests/provider.test.ts` — pinned model versioning, missing-key handling, max-2-retry enforcement, fixture cache misses, and two PROTECTED INVARIANT tests: no provider falls back to another vendor's key, and a moving model alias is rejected at construction.

Command: `npm --workspace=packages/provider run test`
