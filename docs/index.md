# DeepDive Documentation Index

Index of component documentation (`doc.md`) across the DeepDive monorepo.

| Package / Component | Build Step | Description | Path |
|---|---|---|---|
| `@deepdive/core` (domain) | 1.1 | Domain schemas, Zod validation, and Quarantine Boundary `Finding` type | [packages/core/src/domain/doc.md](file:///c:/Users/chukw/DeepDive/packages/core/src/domain/doc.md) |
| `@deepdive/core` (ports) | 1.2 | Service interface ports, deterministic fakes, and D-3 Clock/ID abstraction | [packages/core/src/ports/doc.md](file:///c:/Users/chukw/DeepDive/packages/core/src/ports/doc.md) |
| `@deepdive/core` (state) | 1.3 | Greenfield/Onboarding phase state machine, gates, and unbounded rounds | [packages/core/src/state/doc.md](file:///c:/Users/chukw/DeepDive/packages/core/src/state/doc.md) |
| `@deepdive/storage` | 1.4 | SQLite storage layer, checksummed migrations, append-only history, repositories | [packages/storage/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/storage/src/doc.md) |
| `@deepdive/sandbox` | 2.1, 2.2 | OS sandbox preflight, wrappers, path canonicalization, and command policy | [packages/sandbox/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/sandbox/src/doc.md) |
| `@deepdive/provider` | 2.3 | BYO-key model provider, temperature 0, schema validation, and fixture replay | [packages/provider/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/provider/src/doc.md) |
| `@deepdive/agent` | 3.0, 3.1, 3.2, 3.3 | pi SDK harness, permission hooks, Dual-LLM quarantine, and role sessions | [packages/agent/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/agent/src/doc.md) |
| `@deepdive/agent` (quarantine) | 3.2 | Dual-LLM quarantine boundary filter and prompt-injection containment | [packages/agent/src/quarantine/doc.md](file:///c:/Users/chukw/DeepDive/packages/agent/src/quarantine/doc.md) |
| `@deepdive/agent` (roles) | 3.3 | Role session factories (Scaffolder, Verifier, Grader) and tool scoping | [packages/agent/src/roles/doc.md](file:///c:/Users/chukw/DeepDive/packages/agent/src/roles/doc.md) |
| `@deepdive/vcs` | 1.2 | Version control port abstraction (`GitVcs`, `FakeVcs`) | [packages/vcs/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/vcs/src/doc.md) |
| `@deepdive/content` | 4.1 | Rubric instances, role prompts, L1-L4 rules, struggle rules, golden snapshots | [packages/content/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/content/src/doc.md) |
| `@deepdive/engine` (runner) | 5.1 | Sandboxed test runner integration (`vitest`, `jest`, `cargo`, `pytest`) & P-5 invariant | [packages/engine/src/runner/doc.md](file:///c:/Users/chukw/DeepDive/packages/engine/src/runner/doc.md) |
| `@deepdive/engine` (pipeline) | 5.2 | Submission pipeline orchestrator, D-1 deterministic short-circuit gate & SQLite saving | [packages/engine/src/pipeline/doc.md](file:///c:/Users/chukw/DeepDive/packages/engine/src/pipeline/doc.md) |
| `@deepdive/greenfield` | 6.1, 6.2, 6.3 | Greenfield workspace initialization, phase A-F validation, gating & unbounded rounds | [packages/greenfield/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/greenfield/src/doc.md) |
| `@deepdive/onboarding` | 7.1, 7.2, 7.3 | Onboarding workspace init, commit SHA pinning, RSDD citation verification, gating OB-A-G | [packages/onboarding/src/doc.md](file:///c:/Users/chukw/DeepDive/packages/onboarding/src/doc.md) |
| `@deepdive/vscode-extension` | 8.1, 8.2 | VS Code Extension host, webview postMessage bridge, L1-L4 hint panel & struggle modal | [apps/vscode-extension/src/doc.md](file:///c:/Users/chukw/DeepDive/apps/vscode-extension/src/doc.md) |
