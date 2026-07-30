# pi Agent Harness & Role Sessions

**Package:** @deepdive/agent  ·  **Build step:** 3.0, 3.1, 3.2, 3.3  ·  **Architecture ref:** §2, §3, §4, §6

## What it does
Adapts the real `@earendil-works/pi-coding-agent` SDK into role-scoped agent sessions, implements the `tool_call` permission gate, and enforces the Dual-LLM quarantine boundary (`Finding` filter) between Verifier and Grader.

## How it works
1. **SDK contract (Step 3.0):** `pi_contract.ts` is a thin adapter over the **installed** pi SDK — `createAgentSession`, `DefaultResourceLoader`, `SettingsManager`, `SessionManager`. It was previously a hand-written reimplementation that had never been checked against the published package; see *Constraints* for what that hid.
2. **Roles split by whether they need tools:**
   - **Scaffolder** and **Verifier** run on the pi harness because they need real filesystem and bash tools.
   - **Grader** does **not** use pi-coding-agent at all. It holds no tools and emits only a structured verdict, so a tool-executing harness would be capability it must never have. Its model calls go through `@deepdive/provider` (pi-ai). P-2 becomes a property of what the Grader *is*, not of a hook that could be misconfigured.
3. **Exact allowlists, never `noTools`:** every role declares an explicit `tools` array. pi documents the allowlist as exact ("only the listed tool names are enabled"), so role scoping does not depend on interpreting `noTools` semantics.
4. **Permission gate (Step 3.1):** `createRoleGateExtension` registers our policy hook as a pi **inline extension** on the `tool_call` event. It evaluates `PathPolicyEvaluator` and `classifyCommand`, and fails closed if the evaluator throws.
5. **Dual-LLM quarantine boundary (Step 3.2):** Verifier observations become strictly typed `Finding` objects via `FindingSchema`. `filterAndSanitizeFindings` strips raw repo text before findings reach the Grader, so raw student or repository text never crosses that boundary (§6).

6. **Authentication is pi's (`credential_resolver.ts`):** `resolveProviderCredential` checks the environment, then pi's login store, reporting which source won so a surprising result can be traced without printing the credential. Adopting pi's store is what makes `pi login` — including Anthropic OAuth — work for DeepDive. Each provider reads only its own variables, so no credential is offered to an endpoint it was not issued for.

7. **Approval layer (`approval.ts`):** `withApproval` composes the policy hook with human approval in that order. Policy runs first and its denials are final — a student is never *offered* the chance to approve a graded-artifact write. Approval can only narrow what policy permits. Mode `approve` asks before mutating tools; `auto` asks nothing; read-only tools never prompt in either.

## How to use it
```typescript
import { buildRoleSession } from '@deepdive/agent';
import { PathPolicyEvaluator } from '@deepdive/policy';

const pathEvaluator = new PathPolicyEvaluator({
  readOnlyPaths: ['/workspace'],
  readWritePaths: ['/workspace/tests'],
  blockedPaths: [],
});

// Scaffolder and Verifier are async — they construct a real pi session.
const scaffolder = await buildRoleSession('scaffolder', pathEvaluator, ['sdd.json']);
const verifier = await buildRoleSession('verifier');

// The Grader is tool-free and needs no harness.
const grader = await buildRoleSession('grader');
```

## Constraints & gotchas
- **There is no OS sandbox.** Authorisation is the policy engine plus per-command approval — the model Claude Code uses. Path scoping was always enforced in-process by `PathPolicyEvaluator` in the tool gate, so removing the sandbox did not remove the check that enforces P-2. Codebase Onboarding will need isolation restored before it ships, since a cloned repository's suite runs code nobody here wrote.
- **OAuth drives sessions but not the Grader.** pi's `ModelRuntime` resolves and refreshes an OAuth token for Scaffolder and Verifier. The Grader issues a direct pi-ai call that takes an API key, so an OAuth-only login cannot drive grading; `deepdive doctor` reports this rather than letting it fail at the provider.
- Reading pi's `auth.json` requires pi-coding-agent, which the Grader deliberately does not depend on. The CLI resolves the credential once as composition root and passes it down, so adopting pi auth did not drag the harness into the Grader.
- **The old stub had a security inversion.** It read `noTools: 'builtin'` as "drop custom tools too", while real pi documents the opposite — built-ins disabled, extension/custom tools **kept**. Any role relying on the stub's reading would have silently retained custom tools. Roles now use exact allowlists, and a test asserts no role emits `noTools` at all.
- **`createAgentSession` is async** and returns `{ session, extensionsResult, modelFallbackMessage }`, not a session directly. Role factories are therefore async.
- **pi's `tool_call` event exposes mutable `input` with no re-validation after a handler edits it.** The gate is handed the live object, so it validates what will actually execute, and discovered extensions are disabled (`noExtensions: true`) so no third-party handler can mutate arguments after our gate has approved them. Inline factories still load, so our own gate survives.
- pi provides no `clock`/`idGenerator` injection point; session ids come from its `SessionManager`. D-3 injection applies to our code, not to pi's session identifiers.
- Scaffolder writes targeting graded-artifact paths (`sdd.json`, `rsdd.json`, `cdd.json`) are blocked by the P-2 check.
- Requires Node **22.19.0** — pi-coding-agent and pi-ai both require `>=22.19.0`.

## Tests
`packages/agent/tests/sdk_contract.test.ts` verifies our adapter against the **installed** SDK (previously it verified a stub against itself), plus `permission_hook.test.ts`, `quarantine.test.ts`, and `role_sessions.test.ts`. Role tests drive the gate through the same extension pi itself would invoke, rather than through a stubbed executor.

PROTECTED INVARIANT tests: role scoping never depends on `noTools` semantics; the Grader holds no tools and no coding-agent harness; a throwing policy hook fails closed; the gate reads live tool input rather than a pre-mutation snapshot; P-2 blocks Scaffolder writes into graded-artifact paths.

Command: `npm --workspace=packages/agent run test`
