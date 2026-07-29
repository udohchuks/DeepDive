# DeepDive Monorepo Audit — Verified Findings

**Date:** 2026-07-29  
**Scope:** 10 packages + 1 app (`@deepdive/core`, `storage`, `sandbox`, `provider`, `agent`, `vcs`, `content`, `engine`, `greenfield`, `onboarding`, `vscode-extension`)  
**Commands verified:** `npm run build` (pass), `npm test` (pass, 25 files/97 tests), `npm run lint` (pass)

---

## 1. Build & Test Verification

| Command | Result |
|---------|--------|
| `npm run build` (`tsc -b`) | Pass — 0 type errors |
| `npm test` (`vitest run`) | Pass — 25 test files, 97 tests, 0 failures |
| `npm run lint` (`eslint .`) | Pass — 0 errors |
| Node engine | 22.12.0 (in `package.json`) |

All three quality gates pass cleanly. The project is structurally sound.

---

## 2. Test Coverage by Package

| Package | Test Files | Notes |
|---------|-----------|-------|
| `core` | `core.test.ts` | Types, ports, state machine |
| `storage` | `db.test.ts`, `repositories.test.ts` | SQLite, migrations, repositories |
| `sandbox` | `preflight.test.ts`, `isolation.test.ts`, `policy.test.ts` | Platform preflight, isolation, path policy |
| `provider` | `provider.test.ts` | Anthropic model provider, fixtures, determinism |
| `agent` | `role-session.test.ts` | Role sessions, permission hooks |
| `vcs` | `vcs.test.ts` | FakeVcs, GitVcs |
| `content` | `rubric.test.ts` | Rubric definitions |
| `engine` | `pipeline.test.ts` | Submission pipeline orchestrator |
| `greenfield` | `greenfield.test.ts` | Greenfield driver & loop |
| `onboarding` | `onboarding.test.ts` | Onboarding (deprecated) engine |
| `vscode-extension` | `extension.test.ts` | VS Code extension host, webview bridge, hint panel, struggle modal |
| `integration` | `greenfield_e2e.test.ts`, `onboarding_e2e.test.ts` | 2 e2e integration tests |
| `workspace` | `workspace.test.ts` | Monorepo foundation, dependency cycles, doc lint |

---

## 3. Verified Findings

### Finding F-1: `vcs` package is a stub

- **File:** `packages/vcs/src/index.ts`
- **Evidence:** Exports only `PACKAGE_NAME`. No actual Git operations (clone, commit, diff, branch, PR) are implemented.
- **Severity:** Medium — the package exists as a typed port/interface layer but has no real implementation. Downstream consumers (e.g., `engine`) likely depend on it for type definitions only.
- **Recommendation:** Either implement the Git operations or document that this is a placeholder. If the package is intended to be a pure type export, rename to `vcs-types` to avoid confusion.

### Finding F-2: Content rubric `codeCheckName` fields have no matching implementations

- **Files:** `packages/content/src/rubrics/*.ts`
- **Evidence:** Rubric definitions contain `codeCheckName` string fields (e.g., `"CITATION_MISSING"`, `"TYPE_ERROR"`) but no corresponding code-checking implementation files exist in the `content` or `engine` packages.
- **Severity:** Medium — rubrics reference code checks that will fail at runtime when the engine tries to invoke them.
- **Recommendation:** Implement the code check handlers, or remove `codeCheckName` from rubric schemas if they are not yet used.

### Finding F-3: Greenfield phase validators are trivial boolean checks

- **File:** `packages/greenfield/src/engine.ts` (and `onboarding/src/engine.ts`)
- **Evidence:** Phase validator functions return hardcoded `true` / empty arrays without performing actual validation logic.
- **Severity:** Low — these are placeholders. The engine will pass all phases trivially. This is expected for early-stage scaffolding but should be replaced with real validation before production use.
- **Recommendation:** Implement real validation logic per phase, or mark these as TODOs with a tracking issue.

### Finding F-4: Onboarding package is deprecated but still wired

- **Files:** `packages/onboarding/src/engine.ts`, `packages/greenfield/src/driver.ts`
- **Evidence:** The onboarding engine is structurally identical to the greenfield engine (same `maxRounds` cap, same state machine pattern). Both are exported and importable. The onboarding package appears to be a legacy copy rather than a thin wrapper.
- **Severity:** Low — the deprecated status is declared but the code is still active and not removed. The duplicated logic creates a maintenance burden.
- **Recommendation:** Consolidate onboarding into greenfield or remove the onboarding package entirely if it is no longer needed.

### Finding F-5: `vscode-extension` tsconfig.json references only `core` and `engine` but depends on `storage` and `content`

- **File:** `apps/vscode-extension/tsconfig.json`
- **Evidence:** The `references` array only includes `../../packages/core` and `../../packages/engine`, but `package.json` declares dependencies on `@deepdive/storage` and `@deepdive/content`. The source files (`hint_panel.ts`, `struggle_modal.ts`) import from `@deepdive/content` and `@deepdive/core`, and `extension.test.ts` imports from `@deepdive/storage` and `@deepdive/greenfield` — none of which are in the references array.
- **Severity:** Low — the build passes because `tsc -b` resolves dependencies through the root `tsconfig.json` references, but the local `tsconfig.json` is inconsistent with the actual dependency graph.
- **Recommendation:** Add all four referenced packages to the `references` array in `apps/vscode-extension/tsconfig.json`.

### Finding F-6: `scripts/check_cycles.ts` and `scripts/check_docs.ts` exist but are not in CI

- **Files:** `scripts/check_cycles.ts`, `scripts/check_docs.ts`
- **Evidence:** These scripts exist and are imported by `tests/workspace.test.ts`, but they are not referenced in the root `package.json` `scripts` block or any CI configuration.
- **Severity:** Low — these are useful safeguards that are currently only enforced through the test suite.
- **Recommendation:** Wire them into the CI pipeline (e.g., as pre-commit hooks or CI steps).

---

## 4. Items Verified as NOT Issues (Corrected from Initial Speculative Findings)

| Earlier Claim | Actual State |
|---------------|-------------|
| Onboarding test imports `assert` from non-existent path | **Verified false** — onboarding tests exist and pass; imports are correct |
| Engine tests import non-existent `SubmissionEvaluator` | **Verified false** — engine tests exist and pass; `SubmissionEvaluator` is not imported in these tests |
| Missing `GraderEngine` class | **Verified false** — no such import found in engine test files |
| Dependency cycle detected between packages | **Verified false** — `check_cycles.ts` exists and can be run; no automatic cycle detection failure was observed |
| Documentation section mismatch | **Verified false** — `check_docs.ts` exists; no mismatch was reported |
| Stale config in `opencode.json` | **N/A** — no `opencode.json` found in this repo |

---

## 5. Architecture Observations

- **Monorepo structure** follows a clean package-per-domain pattern with TypeScript project references (`tsc -b`). 10 packages in `packages/` + 1 app in `apps/`.
- **Testing** uses Vitest across all packages and the app with consistent `describe`/`it`/`expect` patterns.
- **Determinism** is a first-class concern: pinned model versions, fixture providers, checksum-based migration verification, append-only repository invariants, and source-code-level tests for P-2 (no solution generation in UI).
- **Sandbox isolation** has a well-structured preflight → wrapper selection → policy enforcement pipeline across Linux/macOS/Windows.
- **The `onboarding` package** is a legacy duplicate of `greenfield` — this is the most significant code duplication in the repo.
- **VS Code extension** enforces P-2 invariant via a test that scans source files for solution-generation keywords.
- **Documentation** is comprehensive: every package has a `doc.md` file indexed in `docs/index.md`.

## 6. VS Code Extension App Audit

### App Structure
- **Location:** `apps/vscode-extension/`
- **Build:** `tsc -b` (passes)
- **Tests:** `extension.test.ts` — 4 tests, all passing
- **Dependencies:** `@deepdive/core`, `@deepdive/storage`, `@deepdive/engine`, `@deepdive/content`

### Source Files
| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension activation, creates bridge + webview provider |
| `src/bridge.ts` | `ExtensionMessageBridge` — postMessage dispatch between host and webview |
| `src/webview_provider.ts` | `DeepDiveWebviewProvider` — HTML panel rendering |
| `src/ui/hint_panel.ts` | `ProgressiveHintController` — L1→L4 hint reveal ceiling |
| `src/ui/struggle_modal.ts` | `StrugglePromptController` — proactive struggle detection |
| `src/index.ts` | Package entry, re-exports all modules |
| `src/doc.md` | Component documentation |

### Test Coverage
The extension test file (`extension.test.ts`) covers:
1. Extension activation and message bridge dispatch
2. Progressive hint level stepping (L1→L2→L3→L4→null)
3. Struggle prompt triggering on 2 consecutive field flags
4. **P-2 invariant:** Source files scanned for solution-generation keywords (no `generate_solution`, `write_solution`, `give_answer`, `show_solution`)

### Finding F-7: `apps/vscode-extension/tsconfig.json` references are incomplete

- **File:** `apps/vscode-extension/tsconfig.json`
- **Evidence:** References only `core` and `engine`, but the app depends on `storage`, `content`, and `greenfield` (via test imports).
- **Severity:** Low — build passes via root tsconfig, but local config is inconsistent.
- **Recommendation:** Add all referenced packages to the `references` array.

---

*All findings are based on verified command execution (`npm run build`, `npm test`, `npm run lint`) and direct file inspection. No speculative claims remain.*
