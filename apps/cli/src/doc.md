# DeepDive CLI

**Package:** @deepdive/cli  ·  **Build step:** 9.0  ·  **Architecture ref:** §9b, D-1, D-2

## What it does
Provides the first runnable entry point for DeepDive: a `deepdive` binary with two commands. `doctor` reports whether this machine can run a session at all (sandbox availability, provider selection, API-key presence) without making a network call or spending anything. `grade` runs a real submission through the deterministic gate and then the model-backed Grader.

## How it works
1. **Deterministic-first grading (D-1):** `runGrade` evaluates the rubric's deterministic criteria through `evaluateDeterministicGate` before anything else. If the gate fails, the command reports the failing findings and returns **without calling the model**. A charter missing its title costs nothing and gives the same answer every run.
2. **Only judged criteria reach the model:** criteria already settled by a code check are not re-litigated by an LLM, so the model sees a smaller prompt and cannot overturn a deterministic result.
3. **Strict structured output (D-2):** the verdict is parsed with `GraderVerdictSchema`. An unparseable verdict throws rather than being coerced — a malformed verdict is a failed call, not a lenient pass.
4. **Fail-closed configuration:** a missing key raises `MissingApiKeyError` and an unrecognised `MODEL_PROVIDER` raises `UnsupportedProviderError` listing valid ids. `runCli` returns an exit code instead of calling `process.exit`, so the whole flow is testable.

## How to use it
```bash
npm run build
node --env-file=.env node_modules/.bin/deepdive doctor
```

`doctor` prints sandbox status, the selected provider, the pinned model, and whether a key was found. Then grade a real artifact:

```bash
node --env-file=.env node_modules/.bin/deepdive grade charter ./my-charter.json
```

`--env-file` is Node's own loader, which keeps the key out of shell history. Available rubrics: `charter`, `sdd`.

## Constraints & gotchas
- **`grade` spends money.** It issues a real model call at temperature 0 against the pinned model whenever the deterministic gate passes and the rubric has judged criteria. `doctor` never does.
- The sandbox preflight is fail-closed. On Windows it requires **both** WSL2 and bubblewrap inside it; `doctor` reports `unsupported` with remediation text rather than silently running unsandboxed.
- `scaffold` and `verify` run tool-using roles against a real workspace, so they check the sandbox **before** resolving credentials and refuse to run when it is unavailable. There is no unsandboxed fallback.
- Role sessions authenticate through `createRoleModel`, which installs the key as pi's *non-persistent* runtime credential. The key is never written to pi's `auth.json`, and pi's own credential discovery is never consulted — our `KeyStore` stays the single source.
- pi's `setRuntimeApiKey` triggers a model-catalog refresh whose default options permit network access; that refresh is pinned offline, since a catalog fetch to an unreachable host hangs the command instead of failing.
- Requires Node **22.19.0** (`.nvmrc`), raised from 22.12.0 because `@earendil-works/pi-ai` and `pi-coding-agent` both require `>=22.19.0`.

## Tests
`apps/cli/tests/cli.test.ts` — usage/exit codes, unknown command and unknown rubric handling, doctor's report of unrecognised providers, judged-criteria-only prompt construction, and verdict schema coverage. All tests use a spy `ModelProvider`, so none touches the network.

PROTECTED INVARIANT tests: a deterministic failure short-circuits before any model call is made (D-1); an unparseable verdict is rejected rather than coerced (D-2).

Command: `npm --workspace=apps/cli run test`
