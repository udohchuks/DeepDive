# Build.md — Guided Project Learning Platform Implementation Plan

**Companion to:** [project.md](project.md) and [architecture.md](architecture.md)
**Status:** Implementation blueprint & execution order
**Audience:** A coding agent executing this plan step by step, and the human reviewing its output.

---

## 1. Overview & build strategy

This document defines the dependency-ordered engineering plan for constructing the **Guided Project Learning Platform** (`DeepDive`). Every step builds only on components verified in earlier steps.

### Core implementation principles

1. **Strict dependency order.** Bottom-up: workspace → domain & storage → sandbox → provider → agent harness → orchestrator → mode engines → UI → vertical slices. Never build forward of a dependency.
2. **Mandatory test pairing.** No step is complete without its automated test suite passing.
3. **Deterministic verification.** Every step states an explicit *Definition of done* — the objective condition that makes the step finished. Verification commands are how you check it, not a substitute for it.
4. **Mandatory documentation.** Every step produces or updates a `doc.md` (see §3). A step with passing tests and no `doc.md` is **not** done.
5. **Architectural compliance.** Enforce the invariants in [architecture.md](architecture.md):
   - Local-only execution; SQLite single-file storage; no backend service.
   - Dual-LLM quarantine — the Verifier is the only role that reads raw repo/student text; the Grader receives structured findings only (§6).
   - pi SDK (`@earendil-works/pi-coding-agent`) with a `tool_call` permission hook (§4).
   - Zero AI-authored graded artifacts, enforced by tool scoping rather than by prompting (§3).

---

## 2. Execution protocol for the coding agent

Read this section before starting any step.

**Per-step loop — do these in order, one step at a time:**

1. Re-read the referenced section of `architecture.md`. It is the source of truth; this document is the sequencing of it. **If the two disagree, stop and ask — do not silently pick one.**
2. Write the implementation files listed under *Build target*.
3. Write the tests listed under *Tests*.
4. Run the *Verification commands*. All must pass.
5. Confirm the *Definition of done* holds.
6. Write or update the step's `doc.md` (§3).
7. Commit as a single logical unit: `feat(<package>): <step id> <short description>`.

**Rules:**

- Do not begin step N+1 until step N's definition of done holds and its `doc.md` exists.
- Do not skip ahead to "make it work end-to-end." Partial vertical slices before Phase 10 produce untestable code.
- When a step depends on an interface from a not-yet-built package, depend on the **interface declared in `@deepdive/core`**, never on the implementation. Seams are named explicitly where they occur.
- If a listed API does not exist in the installed SDK version, **stop and report**. Do not invent a substitute API.
- If a decision is genuinely underspecified in both documents, stop and ask. Do not choose and proceed.

**Conventions (apply everywhere):**

| Aspect | Convention |
|---|---|
| Language | TypeScript, strict mode, ES modules |
| Package names | `@deepdive/<dir>` — e.g. `@deepdive/core` |
| Files | `snake_case.ts`; React components `PascalCase.tsx` |
| Types & schemas | Zod schema is the source of truth; derive TS types via `z.infer` |
| Exports | Each package exposes a single `src/index.ts` barrel; deep imports across packages are forbidden |
| Errors | Typed error classes per package extending a shared `DeepDiveError`; never throw bare strings |
| Async | `async/await` only; no floating promises |
| Test runner | Vitest, colocated in each package's `tests/` directory |
| Secrets | Never logged, never persisted in SQLite, never written to `doc.md` |
| Determinism | Anything test-authoritative (§5 in project.md) must not call a model |

---

## 2b. Determinism & reproducibility controls

Reliability here is mostly a determinism problem: the same input must produce the same result, and anything that *can* be decided without a model *must* be. These controls are mandatory and are enforced by tests, not by discipline.

### D-1. Deterministic-first grading

Every rubric criterion carries an explicit kind:

| Kind | Decided by | Examples |
|---|---|---|
| `deterministic` | Code, no model call | Required section present, citation resolves to a real file and line range, test suite green, schema-valid, word/scope bounds |
| `judged` | Grader model | Coherence of a design rationale, whether a tradeoff is actually reasoned |

**Deterministic criteria run first and short-circuit.** If any fails, the verdict is `revise` and **the Grader is never called** — the flags are generated from the failing checks. A model is asked only about what code cannot decide.

This is the single highest-leverage reliability change in the plan: it removes the model from the majority of verdicts, makes those verdicts byte-identical across runs, and cuts cost and latency at the same time. Build step 4.1 must tag every criterion; step 5.2 must implement the short-circuit.

### D-2. Constrained, validated, bounded model output

Every model call in the system:

- runs at **temperature 0**, with a fixed seed where the provider supports one;
- returns through a **Zod-validated structured schema** — never free text parsed by hand;
- on validation failure, **retries at most twice**, then **fails the turn with a typed error**. Never coerce, never partially accept, never fall back to free text.

A verdict that does not validate is not a lenient verdict; it is an error.

### D-3. Injected clock, IDs, and randomness

No module calls `Date.now()`, `Math.random()`, or `crypto.randomUUID()` directly. `packages/core/src/ports/` declares `Clock` and `IdGenerator`; production wiring supplies real ones, tests supply fixed ones. Timestamps and IDs in completion records are the most common cause of unreproducible snapshots — this removes the whole class.

### D-4. Recorded-fixture fake provider

The Phase 2.3 fake provider is not ad-hoc scripting. It is a **content-addressed fixture store**: requests are keyed by a hash of `(role, prompt version, input payload)` and replayed from `packages/provider/fixtures/`. A cache miss is a **hard failure with the missing key printed**, never a live call and never an improvised response. Refreshing fixtures is a deliberate, reviewed action.

Consequence: the entire test suite from Phase 3 onward is fully deterministic and runs offline.

### D-5. Pinned everything

- Exact dependency versions — no `^`, no `~`. Lockfile committed.
- Node version pinned in `.nvmrc` and `engines`.
- The pi SDK version recorded in `packages/agent/src/doc.md` and asserted by the 3.0 contract test.
- Model **name and version pinned explicitly** in provider config; never an alias like `-latest`, which silently changes grading behaviour under you.
- Onboarding fixture repos vendored at a **fixed commit SHA**; e2e tests never clone from the network.

### D-6. Golden-file tests for content

Prompts and rubrics are snapshot-tested in `packages/content/tests/golden/`. Editing any prompt or rubric fails the golden test until the snapshot is deliberately updated. Grading criteria then cannot drift silently — every change to what "approved" means is visible in a diff.

### D-7. Ordered, append-only, content-addressed persistence

- Every SQL read that feeds a decision or a rendered list carries an explicit `ORDER BY`. SQLite's default row order is not a contract.
- `rounds` and `turns` are **append-only** — corrections are new rows, never updates.
- Each submission stores a **content hash** of the artifact, so an identical resubmission is detectable and a replayed pipeline run is verifiable against its recorded inputs.
- Migrations are **checksummed**; a modified applied migration is a startup error, not a silent divergence.

### D-8. One verification command

`npm run verify` runs, in order: `typecheck` → `lint` → dependency-cycle check → all package tests → **`doc.md` presence lint** (§3) → e2e. This is the only command anyone needs to trust a working tree, and it is what CI runs. The doc lint is what makes §3 an enforced gate rather than a request.

---

## 3. Documentation requirement (`doc.md`)

**Every feature ships with documentation. This is a build gate, not a courtesy.**

Each numbered step writes a `doc.md` in its own build-target directory — e.g. `packages/storage/src/doc.md`, `packages/agent/src/roles/doc.md`. If a step extends a directory that already has a `doc.md`, **update it in place**; do not create a second file.

Each `doc.md` must contain exactly these sections:

```markdown
# <Feature name>

**Package:** @deepdive/<name>  ·  **Build step:** <e.g. 3.3>  ·  **Architecture ref:** <e.g. §3>

## What it does
One paragraph, plain language. What problem in the product does this solve?

## How it works
The technical explanation: key modules, data flow, important types, and the
reasoning behind non-obvious choices. Name the architectural invariant it upholds,
if any.

## How to use it
The public API surface with a runnable code example. Inputs, outputs, thrown errors.

## Constraints & gotchas
Platform limits, ordering requirements, known sharp edges, anything a future
change could easily break.

## Tests
Which suite covers this and what it asserts. Command to run it.
```

Rules:
- Document the **public surface**, not every internal function.
- Code examples must be real — copied from a passing test where possible.
- When a step changes behaviour documented earlier, update that `doc.md` in the same commit.
- A root `docs/index.md` lists every `doc.md` with a one-line summary; append to it as each is created.

---

## 4. Workspace & monorepo structure

TypeScript monorepo using npm workspaces.

```
DeepDive/
├── build.md
├── project.md
├── architecture.md
├── package.json
├── tsconfig.base.json
├── vitest.config.ts
├── diagrams/
├── docs/
│   └── index.md                # index of every doc.md in the repo
├── packages/
│   ├── core/                   # Domain schemas, interfaces, state machine, gates
│   ├── storage/                # SQLite layer, migrations, repositories
│   ├── sandbox/                # OS process sandbox wrappers + path/command policy
│   ├── provider/               # BYO-key AI model provider abstraction
│   ├── agent/                  # pi SDK harness, role sessions, tool hooks, quarantine
│   ├── vcs/                    # Git / GitHub integration (clone, branch, push, PR)
│   ├── content/                # Rubrics, role prompts, hint-level content rules
│   ├── engine/                 # Orchestrator, submission pipeline, hints, quizzes
│   ├── greenfield/             # Greenfield phase controllers (A–F)
│   └── onboarding/             # Onboarding phase controllers (OB-A–OB-G)
└── apps/
    └── vscode-extension/       # VS Code extension UI, webview panels
```

**Dependency direction** (a package may import only from packages to its left):

```
core → storage, sandbox, provider, content
     → agent (needs sandbox, provider, content)
     → vcs
     → engine (needs storage, agent, sandbox, content)
     → greenfield, onboarding (need engine)
     → vscode-extension
```

`core` imports nothing internal. Any cycle is a bug.

---

## 5. Phase-by-phase build roadmap

---

### Phase 0 — Monorepo foundation

#### 0.1 Workspace & toolchain

- **Build target:**
  - `package.json` (npm workspaces; scripts `build`, `test`, `lint`, `typecheck`, `verify`; **exact dependency versions, no ranges**; `engines.node` pinned)
  - `.nvmrc`, committed lockfile (D-5)
  - `scripts/check_cycles.ts`, `scripts/check_docs.ts` (doc.md presence lint, §3)
  - `tsconfig.base.json` (strict, ESM, project references)
  - `vitest.config.ts` (workspace-wide)
  - `.eslintrc`, `.prettierrc`, `.gitignore`
  - A `package.json` + `tsconfig.json` + `src/index.ts` stub for each of the ten packages in §4
  - `docs/index.md` (empty index, header only)
- **Description:** Initialize the workspace, shared TypeScript settings, lint/format config, and one buildable stub per package so project references resolve from the start.
- **Tests:** `tests/workspace.test.ts` — asserts every package resolves by its `@deepdive/*` name and the dependency graph in §4 has no cycles.
- **Verification:** `npm install && npm run verify`
- **Definition of done:** All ten packages build and cross-resolve; the cycle check passes; lint clean; `npm run verify` exists and chains typecheck → lint → cycles → tests → doc lint → e2e (D-8); no dependency uses a version range.
- **Doc:** `docs/index.md` created; root `README.md` records the layout and the commands above.

---

### Phase 1 — Core domain, state machine, storage

#### 1.1 Domain schemas & types

- **Build target:** `packages/core/src/domain/`
  - `types.ts` — phase IDs, role IDs, submission status enums
  - `charter.ts` — Accepted Project Charter, Repo Learning Charter
  - `sdd.ts` — System Design Document, Reverse System Design Document
  - `cdd.ts` — Contribution Design Document
  - `rubric.ts` — rubric definition, flag, question, verdict schemas
  - `hints.ts` — L1–L4 hint schemas and reveal state
  - `quiz.ts` — quiz item and concept-bank schemas
  - `completion.ts` — completion record, hint profile
  - `finding.ts` — **the quarantine boundary type**: the only shape allowed to cross Verifier → Grader (§6)
- **Description:** Zod schemas plus inferred TypeScript types for every structured artifact. `finding.ts` is load-bearing for the security model — it must be incapable of carrying free-form repo or student text.
- **Tests:** `packages/core/tests/schemas.test.ts` — round-trip serialization for each schema; rejection of malformed input; **assert `Finding` has no unconstrained string field that could smuggle raw text.**
- **Verification:** `npm --workspace=packages/core run test`
- **Definition of done:** Every artifact named in project.md §6–§7 has a schema; the `Finding` containment assertion passes.
- **Doc:** `packages/core/src/domain/doc.md`

#### 1.2 Service interfaces (seam declarations)

- **Build target:** `packages/core/src/ports/`
  - `model_provider.ts` — interface implemented in Phase 2.3
  - `hint_service.ts` — interface implemented in Phase 8.1
  - `test_runner.ts` — interface implemented in Phase 5.1
  - `vcs.ts` — interface implemented in Phase 6.1
  - `clock.ts` — `Clock` and `IdGenerator` (D-3), with fixed-value fakes exported for tests
- **Description:** Declare the interfaces that later phases implement, so earlier consumers (notably the Phase 5 pipeline) can depend on a contract rather than on unbuilt code. **This is what resolves the pipeline↔hints ordering problem.** `clock.ts` exists so that no module anywhere reaches for ambient time, randomness, or UUIDs.
- **Tests:** `packages/core/tests/ports.test.ts` — type-level conformance checks against minimal fakes; a repo-wide lint rule test asserting no direct `Date.now`, `Math.random`, or `randomUUID` call outside the production wiring module.
- **Verification:** `npm --workspace=packages/core run test`
- **Definition of done:** Each port has a documented interface and a working in-memory fake exported for test use.
- **Doc:** `packages/core/src/ports/doc.md`

#### 1.3 Phase state machine & gates

- **Build target:** `packages/core/src/state/`
  - `state_machine.ts` — Greenfield A–F and Onboarding OB-A–OB-G transitions
  - `gates.ts` — entry/exit criteria per phase
- **Description:** Pure, side-effect-free transition logic. Unlocks the next level only on rubric approval; rejects illegal transitions. **No round cap exists** — rounds are unbounded by decision (architecture.md §7); do not add one.
- **Tests:** `packages/core/tests/state_machine.test.ts` — every legal transition, every illegal transition rejected, and an explicit assertion that an arbitrarily high round count is still accepted.
- **Verification:** `npm --workspace=packages/core run test`
- **Definition of done:** Full transition table covered; no-round-cap assertion passes; zero I/O in this module.
- **Doc:** `packages/core/src/state/doc.md`

#### 1.4 SQLite storage layer

- **Build target:** `packages/storage/src/`
  - `db.ts` — connection manager (`better-sqlite3`), WAL mode, `foreign_keys=ON`
  - `migrations/001_initial_schema.sql` — `projects`, `phase_states`, `artifacts`, `rounds`, `turns`, `findings`, `hints`, `quizzes`, `completion_records`
  - `migrations/runner.ts` — forward-only versioned runner, **checksums each applied migration** and errors on drift (D-7)
  - `repositories/{project,artifact,round,hint,quiz}_repo.ts`
- **Description:** Embedded per-project SQLite database with a migration engine and typed repositories. Storage is local and single-user; there is no sync layer and no tamper-resistance mechanism — both were considered and declined (architecture.md §7).
- **Tests:**
  - `packages/storage/tests/db.test.ts` — migration execution, idempotent re-run, pragma verification
  - `packages/storage/tests/repositories.test.ts` — CRUD for every repository against in-memory SQLite; **rounds and turns reject update/delete**; every decision-feeding query returns a stable order under shuffled insert order; submission content hashing detects an identical resubmission (D-7)
- **Verification:** `npm --workspace=packages/storage run test`
- **Definition of done:** Migrations run clean on an empty file, are idempotent, and fail loudly if a previously applied migration file changed; every repository is covered; artifact versions are retained rather than overwritten; round/turn history is append-only.
- **Doc:** `packages/storage/src/doc.md`

---

### Phase 2 — Sandbox & model provider

#### 2.1 Platform preflight

- **Build target:** `packages/sandbox/src/preflight.ts`
- **Description:** Detect host OS and required sandbox facility: bubblewrap on Linux, `sandbox-exec` on macOS, WSL2 on Windows. **Windows without WSL2 is a hard block** (architecture.md §9) — return a blocking result with actionable remediation text, never a silent degraded mode.
- **Tests:** `packages/sandbox/tests/preflight.test.ts` — each platform outcome with mocked probes, including the Windows-blocked path.
- **Verification:** `npm --workspace=packages/sandbox run test`
- **Definition of done:** All four outcomes (linux-ok, macos-ok, windows-wsl2-ok, windows-blocked) are covered and no code path allows unsandboxed execution as a fallback.
- **Doc:** `packages/sandbox/src/doc.md`

#### 2.2 OS sandbox wrappers & path policy

- **Build target:** `packages/sandbox/src/`
  - `types.ts` — sandbox options, mount and command policies
  - `linux_bubblewrap.ts`, `macos_seatbelt.ts`, `windows_wsl2.ts`
  - `sandbox_factory.ts` — selects a wrapper from the preflight result
  - `policy/path_policy.ts` — allowlist/blocklist evaluator with canonicalization
  - `policy/command_policy.ts` — read-only vs mutating command classifier
- **Description:** OS-native process isolation confining execution to authorized workspace paths (architecture.md §5). Path evaluation must canonicalize before matching — symlinks and `../` traversal are the whole threat here.
- **Tests:**
  - `packages/sandbox/tests/sandbox_factory.test.ts` — wrapper selection per platform
  - `packages/sandbox/tests/isolation.test.ts` — integration: writes outside the boundary fail (skipped with a clear message on unsupported hosts, never silently passed)
  - `packages/sandbox/tests/policy.test.ts` — canonicalization, `../../` traversal, symlink escape, read-only command classification
- **Verification:** `npm --workspace=packages/sandbox run test`
- **Definition of done:** Traversal and symlink-escape tests fail closed; a real out-of-boundary write is blocked on at least the host platform.
- **Doc:** update `packages/sandbox/src/doc.md`

#### 2.3 Model provider abstraction

- **Build target:** `packages/provider/src/`
  - `provider.ts` — implements the `ModelProvider` port from 1.2
  - `anthropic.ts` — default provider
  - `key_store.ts` — BYO API key via OS credential store, env var fallback
  - `call.ts` — temperature 0, pinned model version (never a `-latest` alias), Zod-validated structured output, **max two retries then typed failure** (D-2)
  - `fake_provider.ts` + `fixtures/` — content-addressed fixture store keyed by hash of `(role, prompt version, input)`; **a cache miss is a hard error printing the missing key**, never a live call (D-4)
- **Description:** Pluggable BYO-key model access, Claude as default (architecture.md §9b). **The fixture-replay fake is what makes Phases 3–10 fully deterministic and offline** — every downstream test uses it.
- **Tests:** `packages/provider/tests/provider.test.ts` — provider selection; missing-key error path; key never appearing in logs or serialized errors; schema-invalid response retried exactly twice then failing typed, **never coerced**; fixture cache miss fails loudly.
- **Verification:** `npm --workspace=packages/provider run test`
- **Definition of done:** Identical input yields byte-identical output across runs; no code path turns an invalid model response into an accepted verdict; no test can reach the network.
- **Doc:** `packages/provider/src/doc.md`

---

### Phase 3 — pi agent harness & role sessions

#### 3.0 SDK capability verification

- **Build target:** `packages/agent/tests/sdk_contract.test.ts`
- **Description:** Before building on it, verify against the installed `@earendil-works/pi-coding-agent` that `createAgentSession` exists and accepts `tools`, `excludeTools`, `noTools`, and `customTools`, and that a `tool_call` lifecycle hook can block a call. **If any of these differ, stop and report before proceeding** — the whole role model rests on them.
- **Verification:** `npm --workspace=packages/agent run test`
- **Definition of done:** The contract test passes against a pinned SDK version, recorded in `doc.md`.
- **Doc:** `packages/agent/src/doc.md` — record the verified SDK version and exact option names.

#### 3.1 tool_call permission hook

- **Build target:** `packages/agent/src/hooks/permission_hook.ts`
- **Description:** The `tool_call` hook that evaluates path and command policy before execution and blocks violations (architecture.md §4). pi has no native path-level permissions; this hook *is* the enforcement.
- **Tests:** `packages/agent/tests/permission_hook.test.ts` — out-of-scope `write`/`edit` blocked; in-scope allowed; mutating bash blocked for read-only roles; **fails closed on evaluator error**.
- **Verification:** `npm --workspace=packages/agent run test`
- **Definition of done:** No path exists where a policy-evaluation failure results in an allowed call.
- **Doc:** update `packages/agent/src/doc.md`

#### 3.2 Dual-LLM quarantine

- **Build target:** `packages/agent/src/quarantine/`
  - `finding_transformer.ts` — raw Verifier observations → `Finding` objects
  - `quarantine_filter.ts` — validates findings, strips anything unstructured
- **Description:** The containment boundary (architecture.md §6). Only structured findings cross to the Grader; raw repo and student text never do.
- **Tests:** `packages/agent/tests/quarantine.test.ts` — a corpus of prompt-injection payloads embedded in simulated repo text, each asserted absent from the filter output; malformed findings rejected rather than passed through.
- **Verification:** `npm --workspace=packages/agent run test`
- **Definition of done:** Every payload in the injection corpus is contained; the filter rejects rather than sanitizes ambiguous input.
- **Doc:** `packages/agent/src/quarantine/doc.md`

#### 3.3 Role session factory

- **Build target:** `packages/agent/src/roles/`
  - `scaffolder.ts` — `write`/`edit`/`bash`, scoped to scaffold and test paths
  - `verifier.ts` — `read`/`grep`/`find`/`bash` read-only
  - `grader.ts` — no filesystem tools; structured verdict via `customTools`
  - `session_factory.ts` — configures and launches `createAgentSession` per role
- **Description:** Role-scoped sessions enforcing tool isolation by construction (architecture.md §3). Use the exact option names verified in 3.0.
- **Tests:** `packages/agent/tests/role_sessions.test.ts` — per role, assert the exact granted tool set; Grader has no filesystem tool; Verifier cannot mutate; **Scaffolder cannot write into a graded-artifact path** (the P-2 enforcement test).
- **Verification:** `npm --workspace=packages/agent run test`
- **Definition of done:** The P-2 test passes and is marked as a protected invariant test in `doc.md`.
- **Doc:** `packages/agent/src/roles/doc.md` — include the role/tool matrix and link `diagrams/agent-roles-permissions.svg`.

---

### Phase 4 — Content assets

#### 4.1 Rubrics, role prompts & hint content rules

- **Build target:** `packages/content/src/`
  - `prompts/{verifier,grader,scaffolder}.ts` — role system prompts
  - `rubrics/{sdd,rsdd,cdd,charter}.ts` — rubric instances conforming to `rubric.ts`; **every criterion tagged `deterministic` or `judged`** (D-1)
  - `tests/golden/` — snapshots of every prompt and rubric (D-6)
  - `hints/level_rules.ts` — the L1–L4 content rules, **including the L4 ceiling** (architecture.md §8b)
  - `hints/struggle_rules.ts` — the locked struggle-detection threshold
- **Description:** All model-facing text and grading criteria as versioned, testable data — not string literals scattered through the engine. The L4 ceiling ("never reveals the answer") lives here as an explicit, assertable rule.
- **Tests:** `packages/content/tests/content.test.ts` — every rubric validates against its schema; **every criterion carries a kind tag, and each `deterministic` one names the code check that decides it**; every prompt is non-empty and references its role's tool constraints; the L4 rule text encodes the ceiling; golden snapshots match.
- **Verification:** `npm --workspace=packages/content run test`
- **Definition of done:** No prompt or rubric text exists outside this package; no criterion is untagged; every prompt carries an explicit version string (the D-4 fixture key depends on it); a prompt edit fails the golden test until the snapshot is deliberately updated.
- **Doc:** `packages/content/src/doc.md` — how to add or amend a rubric, how to bump a prompt version, and what re-grading implications follow.

---

### Phase 5 — Orchestration engine

#### 5.1 Test runner integration

- **Build target:** `packages/engine/src/runner/`
  - `test_runner.ts` — implements the `TestRunner` port; executes `cargo test`, `vitest`, `pytest`, `jest` under the sandbox
  - `output_parser.ts` — stdout/stderr → structured results (pass/fail counts, failing suites, messages)
- **Description:** Deterministic test execution. **Results are authoritative and the AI can never override or reinterpret them** (project.md P-5) — no model call may appear in this module.
- **Tests:** `packages/engine/tests/test_runner.test.ts` — parsing fixtures per framework, including partial failure and crash output; assert zero provider calls.
- **Verification:** `npm --workspace=packages/engine run test`
- **Definition of done:** All four frameworks parse correctly; the no-model-call assertion passes.
- **Doc:** `packages/engine/src/runner/doc.md`

#### 5.2 Submission pipeline orchestrator

- **Build target:** `packages/engine/src/pipeline/`
  - `submission_orchestrator.ts` — steps 1–8 of the §12 sequence flow
  - `deterministic_gate.ts` — evaluates all `deterministic` criteria first and **short-circuits to `revise` without calling the Grader** if any fail (D-1)
  - `clarifying_handler.ts` — clarifying questions answered via Grader without re-running the Verifier
- **Description:** The core loop: load round context → dispatch sandboxed Verifier → run tests if the level requires → **run the deterministic gate** → filter to structured findings → call Grader for `judged` criteria only → persist turn → return verdict. **Step 9 (hint reveal) is deliberately excluded** — it is a separate lazy call, consumed through the `HintService` port from 1.2 and implemented in Phase 8.1.
- **Tests:** `packages/engine/tests/pipeline.test.ts` — full cycle against the fixture provider; all three exits (approved / revise / clarify); persistence verified in SQLite; Grader never receives raw text; **a submission failing a deterministic criterion produces zero provider calls**; the same submission run twice produces an identical verdict.
- **Verification:** `npm --workspace=packages/engine run test`
- **Definition of done:** Each of the three exits is covered end to end; the zero-provider-call and repeat-run-identical assertions both pass; the pipeline compiles and tests green with only the *fake* hint service present.
- **Doc:** `packages/engine/src/pipeline/doc.md` — link `diagrams/submission-sequence.svg`.

---

### Phase 6 — Git & GitHub integration

#### 6.1 VCS layer

- **Build target:** `packages/vcs/src/`
  - `git.ts` — implements the `Vcs` port: clone, checkout, branch, diff, commit, push
  - `github.ts` — fork and pull-request creation
  - `repo_snapshot.ts` — pinned-commit checkout so grading is reproducible across rounds
- **Description:** One of only two things that leave the machine (architecture.md §7). Required by onboarding OB-A (clone) and OB-E (PR prep). Pinning the commit matters: an upstream push mid-course must not invalidate a student's citations.
- **Tests:** `packages/vcs/tests/git.test.ts` — clone/branch/commit/diff against a local fixture repo; GitHub calls mocked; assert no network in the git-only paths.
- **Verification:** `npm --workspace=packages/vcs run test`
- **Definition of done:** A fixture repo can be cloned, pinned, branched, and diffed with no network; PR creation is covered against a mock and never fires unprompted.
- **Doc:** `packages/vcs/src/doc.md`

---

### Phase 7 — Mode engines

#### 7.1 Greenfield phase controllers (A–F)

- **Build target:** `packages/greenfield/src/controllers/`
  - `phase_a_ideation.ts` · `phase_b_design.ts` · `phase_b5_learning.ts` · `phase_c_module_plan.ts` · `phase_d_execution.ts` · `phase_e_quizzes.ts` · `phase_f_completion.ts`
- **Description:** Greenfield controllers implementing entry/exit criteria, rubric checks, charter validation, and progressive scaffolding (project.md §6).
- **Tests:** `packages/greenfield/tests/greenfield_phases.test.ts` — A→F transitions on synthetic submissions; each gate blocks when unmet.
- **Verification:** `npm --workspace=packages/greenfield run test`
- **Definition of done:** Every phase gate has both a passing and a blocking test.
- **Doc:** `packages/greenfield/src/doc.md`

#### 7.2 Onboarding phase controllers (OB-A–OB-G)

- **Build target:** `packages/onboarding/src/controllers/`
  - `phase_oba_charter.ts` · `phase_obb_rsdd.ts` · `phase_obc_reading_plan.ts` · `phase_obd_trace_loop.ts` · `phase_obe_contribution.ts` · `phase_obf_quizzes.ts` · `phase_obg_completion.ts`
  - `citation_checker.ts` — validates file/line citations against the pinned repo snapshot
- **Description:** Onboarding controllers (project.md §7). Citation checking is **deterministic** — it resolves paths and line ranges against the real checkout; it does not ask a model whether a citation looks plausible.
- **Tests:** `packages/onboarding/tests/onboarding_phases.test.ts` — citation validation against a fixture repo including stale-line and missing-file cases; RSDD level advancement; contribution gate.
- **Verification:** `npm --workspace=packages/onboarding run test`
- **Definition of done:** Citation checker is model-free and rejects stale and fabricated citations.
- **Doc:** `packages/onboarding/src/doc.md`

---

### Phase 8 — Hint ladder & quiz engine

#### 8.1 Lazy hint generator & struggle detection

- **Build target:** `packages/engine/src/hints/`
  - `hint_generator.ts` — implements the `HintService` port; lazy per-level generation (L1 orientation → L2 localization → L3 diagnostic → L4 procedural nudge)
  - `struggle_detector.ts` — tracks repeated primary-flag matches across consecutive resubmissions and fires proactive offers
  - `hint_logger.ts` — records reveals in SQLite for completion records
- **Description:** The L1–L4 ladder (architecture.md §8b). **Lazy: exactly one model call per level, only when that level is actually revealed** — never a batch. Reveals are sequential, stacked, and unlimited. Hints are **logged, not gated** — a hint profile never blocks progression.
- **Tests:** `packages/engine/tests/hints.test.ts` — exactly one provider call per reveal; out-of-order reveal rejected; unlimited reveals permitted; struggle counter increments and resets per the locked rule; **L4 output asserted against the ceiling**.
- **Verification:** `npm --workspace=packages/engine run test`
- **Definition of done:** The lazy-call-count assertion and the L4 ceiling assertion both pass; the real implementation is swapped in for the pipeline's fake and 5.2's suite still passes.
- **Doc:** `packages/engine/src/hints/doc.md`

#### 8.2 Concept catalog & quiz engine

- **Build target:** `packages/engine/src/quiz/`
  - `concept_catalog.ts` — need-based concept and skill-graph manager
  - `quiz_engine.ts` — quiz rendering and grading, mastery state
- **Description:** Skill graph and quiz evaluation for comprehension checks and off-project drills (project.md P-6, P-8).
- **Tests:** `packages/engine/tests/quiz.test.ts` — rendering, grading, mastery updates, need-based concept surfacing.
- **Verification:** `npm --workspace=packages/engine run test`
- **Definition of done:** Mastery state persists across sessions via storage.
- **Doc:** `packages/engine/src/quiz/doc.md`

---

### Phase 9 — VS Code extension

#### 9.1 Activation & local IPC

- **Build target:** `apps/vscode-extension/src/`
  - `extension.ts` — entrypoint, command registration, workspace setup, **preflight gate on activation** (2.1)
  - `ipc_client.ts` — bridge between extension host and the local engine
- **Description:** Extension bundle, status bar, command palette entries, and the IPC bridge. On a blocked platform, activation must surface the remediation message rather than proceeding.
- **Tests:** `apps/vscode-extension/tests/ipc.test.ts` — message serialization, command dispatch, activation blocked on failed preflight.
- **Verification:** `npm --workspace=apps/vscode-extension run test`
- **Definition of done:** Extension activates on a supported host and refuses cleanly on an unsupported one.
- **Doc:** `apps/vscode-extension/src/doc.md`

#### 9.2 Artifact editor webview

- **Build target:** `apps/vscode-extension/src/webviews/editor/`
  - `ArtifactEditorPanel.ts` · `EditorApp.tsx` · `field_highlighter.ts`
- **Description:** Structured field-level editor for SDD, RSDD, and CDD, with citation pickers and inline flag highlighting driven by rubric flag field IDs.
- **Tests:** `apps/vscode-extension/tests/editor_panel.test.ts` — form ↔ model state sync; flags highlight the correct fields; drafts survive panel close.
- **Verification:** `npm --workspace=apps/vscode-extension run test`
- **Definition of done:** Draft persistence and flag-to-field mapping both covered.
- **Doc:** update `apps/vscode-extension/src/doc.md`

#### 9.3 Review thread & hint panel

- **Build target:** `apps/vscode-extension/src/webviews/review/`
  - `ReviewThreadPanel.ts` · `ReviewApp.tsx` · `HintWidget.tsx`
- **Description:** The chat-*shaped*, schema-constrained review thread (architecture.md §8). AI turns render only as structured cards — rubric pill, questions, flags, hint refs. **There is no free-text AI message renderer**; the absence of one is what keeps this from becoming a chatbot (P-3).
- **Tests:** `apps/vscode-extension/tests/review_panel.test.ts` — verdict card rendering, sequential hint reveals, thread collapse on approval, and an assertion that unstructured AI content has no render path.
- **Verification:** `npm --workspace=apps/vscode-extension run test`
- **Definition of done:** The no-free-prose assertion passes and is marked a protected invariant test.
- **Doc:** `apps/vscode-extension/src/webviews/review/doc.md`

---

### Phase 10 — Vertical slice integration

#### 10.1 Slice A — Greenfield Rust CLI

- **Build target:** `tests/e2e/greenfield_rust_cli.test.ts`
- **Description:** Full Greenfield run of a Rust CLI project, Phase A → F (project.md §10): scaffold generation, real `cargo test` execution, rubric evaluation, hint progression, completion record.
- **Verification:** `npx vitest run tests/e2e/greenfield_rust_cli.test.ts`
- **Definition of done:** Runs against the fake provider with a real Rust toolchain and real sandbox; produces a valid completion record.
- **Doc:** `docs/slice_a.md` — how to run it and what it proves.

#### 10.2 Slice B — Onboarding OSS repo

- **Build target:** `tests/e2e/onboarding_oss_repo.test.ts`
- **Description:** Onboarding run over a curated OSS repo **vendored at a fixed commit SHA** (D-5) — the e2e test never clones from the network. OB-A through RSDD L1–L5, four reading units, characterization tests, CDD grading, sandbox PR validation.
- **Verification:** `npx vitest run tests/e2e/onboarding_oss_repo.test.ts`
- **Definition of done:** Citations resolve against a pinned real checkout; the contribution gate blocks until characterization tests pass; no real PR is opened.
- **Doc:** `docs/slice_b.md`

---

## 6. Verification matrix

| Phase | Package | Responsibility | Verification command |
|---|---|---|---|
| 0 | workspace root | Monorepo, toolchain, package graph | `npm run build && npx vitest run tests/workspace.test.ts` |
| 1 | `core`, `storage` | Schemas, ports, state machine, SQLite | `npm --workspace=packages/core run test && npm --workspace=packages/storage run test` |
| 2 | `sandbox`, `provider` | Preflight, OS isolation, BYO-key provider | `npm --workspace=packages/sandbox run test && npm --workspace=packages/provider run test` |
| 3 | `agent` | pi SDK, permission hook, quarantine, roles | `npm --workspace=packages/agent run test` |
| 4 | `content` | Rubrics, role prompts, hint rules | `npm --workspace=packages/content run test` |
| 5 | `engine` | Test runner, submission pipeline | `npm --workspace=packages/engine run test` |
| 6 | `vcs` | Git / GitHub integration | `npm --workspace=packages/vcs run test` |
| 7 | `greenfield`, `onboarding` | Mode phase controllers | `npm --workspace=packages/greenfield run test && npm --workspace=packages/onboarding run test` |
| 8 | `engine` | Hint ladder, quiz engine | `npm --workspace=packages/engine run test` |
| 9 | `vscode-extension` | Editor & review webviews | `npm --workspace=apps/vscode-extension run test` |
| 10 | monorepo E2E | Slices A & B | `npx vitest run tests/e2e/` |

**Protected invariant tests.** These encode non-negotiable principles. If one fails, the fix is the code, never the test:

| Test | Guards |
|---|---|
| `core/tests/schemas.test.ts` → Finding containment | Quarantine boundary (§6) |
| `agent/tests/quarantine.test.ts` → injection corpus | Prompt-injection containment (§6) |
| `agent/tests/role_sessions.test.ts` → Scaffolder write block | P-2, AI never authors graded work |
| `engine/tests/test_runner.test.ts` → no model calls | P-5, tests are authoritative |
| `engine/tests/hints.test.ts` → L4 ceiling | Hint ladder never reveals the answer (§8b) |
| `vscode-extension/tests/review_panel.test.ts` → no free-prose path | P-3, not a chatbot |
| `core/tests/state_machine.test.ts` → no round cap | Unbounded rounds (§7) |
| `engine/tests/pipeline.test.ts` → zero provider calls when a deterministic criterion fails | Deterministic-first grading (D-1) |
| `engine/tests/pipeline.test.ts` → repeat run yields identical verdict | End-to-end reproducibility (D-2, D-3, D-4) |
| `provider/tests/provider.test.ts` → invalid response never coerced | Structured output is validated, not salvaged (D-2) |
| `content/tests/golden/` → prompt & rubric snapshots | Grading criteria cannot drift silently (D-6) |

---

## 7. Execution checklist

- [ ] **0** — Workspace, toolchain, ten package stubs, `docs/index.md`
- [ ] **1** — Domain schemas, service ports, state machine, SQLite storage
- [ ] **2** — Platform preflight, OS sandbox wrappers, path policy, model provider + fake
- [ ] **3** — pi SDK contract check, permission hook, quarantine, role sessions
- [ ] **4** — Rubrics, role prompts, hint content rules
- [ ] **5** — Test runner, submission pipeline (steps 1–8)
- [ ] **6** — Git / GitHub integration with pinned snapshots
- [ ] **7** — Greenfield (A–F) and Onboarding (OB-A–OB-G) controllers
- [ ] **8** — Lazy hint ladder + struggle detector, quiz engine
- [ ] **9** — Extension activation, IPC, artifact editor, review thread
- [ ] **10** — Vertical slices A and B

Each box is checked only when tests pass **and** `doc.md` exists or is updated.

---

## 8. Document history

- v0.1 — initial roadmap.
- v0.3 — determinism pass: added §2b controls D-1 through D-8 (deterministic-first grading, constrained/validated model output, injected clock and IDs, fixture-replay provider, pinned versions and model, golden content tests, ordered append-only content-addressed storage, single `verify` command) and wired each into the step that builds it, plus four new protected invariant tests.
- v0.2 — audit pass: repo-relative links; resolved the pipeline↔hints ordering via explicit ports; added missing `provider`, `vcs`, and `content` packages; added platform preflight and SDK contract verification; added per-step definitions of done, an agent execution protocol, conventions, a protected-invariant test register, and the mandatory `doc.md` requirement.
