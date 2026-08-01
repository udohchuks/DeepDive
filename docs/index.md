# DeepDive Documentation Index

Index of component documentation (`doc.md`) across the DeepDive monorepo.

Paths are repo-relative so they resolve for every reader and on GitHub. (They were previously absolute `file:///` URLs containing one developer's home directory.)

| Package / Component | Build Step | Description | Path |
|---|---|---|---|
| `@deepdive/cli` | 9.0 | `deepdive` entry point: doctor, grade, scaffold, verify; permission modes | [apps/cli/src/doc.md](../apps/cli/src/doc.md) |
| `@deepdive/core` (domain) | 1.1 | Domain schemas, Zod validation, and Quarantine Boundary `Finding` type | [packages/core/src/domain/doc.md](../packages/core/src/domain/doc.md) |
| `@deepdive/core` (ports) | 1.2 | Service interface ports, deterministic fakes, and D-3 Clock/ID abstraction | [packages/core/src/ports/doc.md](../packages/core/src/ports/doc.md) |
| `@deepdive/core` (state) | 1.3 | Greenfield/Onboarding phase state machine, gates, and unbounded rounds | [packages/core/src/state/doc.md](../packages/core/src/state/doc.md) |
| `@deepdive/storage` | 1.4 | SQLite storage layer, checksummed migrations, append-only history, repositories | [packages/storage/src/doc.md](../packages/storage/src/doc.md) |
| `@deepdive/policy` | 2.x | Path & command policy: canonicalized access checks and read-only command classification | [packages/policy/src/doc.md](../packages/policy/src/doc.md) |
| `@deepdive/provider` | 2.3 | BYO-key model provider, temperature 0, schema validation, and fixture replay | [packages/provider/src/doc.md](../packages/provider/src/doc.md) |
| `@deepdive/agent` | 3.0, 3.1, 3.2, 3.3 | pi SDK adapter, tool gate, approval modes, Dual-LLM quarantine, role sessions | [packages/agent/src/doc.md](../packages/agent/src/doc.md) |
| `@deepdive/agent` (quarantine) | 3.2 | Dual-LLM quarantine boundary filter and prompt-injection containment | [packages/agent/src/quarantine/doc.md](../packages/agent/src/quarantine/doc.md) |
| `@deepdive/agent` (roles) | 3.3 | Role session factories (Scaffolder, Verifier, Grader) and tool scoping | [packages/agent/src/roles/doc.md](../packages/agent/src/roles/doc.md) |
| `@deepdive/vcs` | 1.2 | Version control port abstraction (`GitVcs`, `FakeVcs`) | [packages/vcs/src/doc.md](../packages/vcs/src/doc.md) |
| `@deepdive/content` | 4.1 | Rubric instances, role prompts, L1-L4 rules, struggle rules, golden snapshots | [packages/content/src/doc.md](../packages/content/src/doc.md) |
| `@deepdive/engine` (runner) | 5.1 | Local test runner integration (`vitest`, `jest`, `cargo`, `pytest`) & P-5 invariant | [packages/engine/src/runner/doc.md](../packages/engine/src/runner/doc.md) |
| `@deepdive/engine` (pipeline) | 5.2 | D-1 deterministic short-circuit gate & clarifying-question handling | [packages/engine/src/pipeline/doc.md](../packages/engine/src/pipeline/doc.md) |
| `@deepdive/greenfield` | 6.1, 6.2, 6.3 | Greenfield workspace initialization, phase A-F validation, gating & unbounded rounds | [packages/greenfield/src/doc.md](../packages/greenfield/src/doc.md) |
| `@deepdive/onboarding` | 7.1, 7.2, 7.3 | Onboarding workspace init, commit SHA pinning, RSDD citation verification, gating OB-A-G | [packages/onboarding/src/doc.md](../packages/onboarding/src/doc.md) |
| `@deepdive/vscode-extension` | 8.1, 8.2 | VS Code extension host, webview postMessage bridge, L1-L4 hint panel & struggle modal | [apps/vscode-extension/src/doc.md](../apps/vscode-extension/src/doc.md) |
