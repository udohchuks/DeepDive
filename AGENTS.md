# DeepDive Repository Guidelines & AI Agent Rules

## Monorepo Architecture
- **TypeScript Project References**: All package builds use `tsc -b`.
- **Package Layers**:
  - `@deepdive/core`: Core domain schemas, interfaces, ports, and state machine transitions.
  - `@deepdive/storage`: SQLite repository persistence layer.
  - `@deepdive/sandbox`: OS-level isolation wrappers and mount policies.
  - `@deepdive/provider`: LLM provider integration adapters.
  - `@deepdive/agent`: Role session definitions, permission hooks, and quarantine filters.
  - `@deepdive/vcs`: Git version control system adapters.
  - `@deepdive/content`: Rubric definitions, prompt templates, and hint level rules.
  - `@deepdive/engine`: Submission pipeline orchestrator, test runners, and deterministic gate.
  - `@deepdive/greenfield`: Greenfield project gating engine and driver loop.
  - `@deepdive/onboarding`: Legacy/onboarding gating engine (deprecated).
  - `@deepdive/vscode-extension`: VS Code Extension host and webview message bridge.

## Mandatory Coding Conventions
1. **Schema Validation**: All external payload inputs must be parsed with Zod schemas.
2. **Path Safety**: Always use forward slashes or `path.join` for cross-platform compatibility.
3. **No Unbounded Loops**: All drivers and iteration loops must enforce explicit boundaries (e.g. `maxRounds`).
4. **Error Handling**: Bridge handlers and tool execution hooks must isolate runtime exceptions to prevent crashing execution chains.

## Testing Standards
- All new features or bug fixes must include unit or integration test coverage using `vitest`.
- Run `npm run build` and `npm test` before submitting changes.
