# DeepDive — Guided Project Learning Platform

DeepDive is a local-only platform that helps developers design, understand, and build software through structured, test-verified learning paths without outsourcing their thinking to AI.

## Monorepo Layout

```
DeepDive/
├── build.md                     # Implementation blueprint & sequence
├── project.md                   # Requirements & non-negotiable principles
├── architecture.md              # Technical design & architectural invariants
├── package.json                 # Root monorepo package configuration
├── tsconfig.base.json           # Shared strict ESM TypeScript configuration
├── vitest.config.ts             # Workspace-wide test configuration
├── docs/
│   └── index.md                # Index of all doc.md files
├── packages/
│   ├── core/                   # Domain schemas, interfaces, state machine, gates
│   ├── storage/                # SQLite layer, migrations, repositories
│   ├── sandbox/                # OS process sandbox wrappers + policy
│   ├── provider/               # BYO-key AI model provider abstraction
│   ├── agent/                  # pi SDK harness, role sessions, tool hooks, quarantine
│   ├── vcs/                    # Git / GitHub integration
│   ├── content/                # Rubrics, role prompts, hint level rules
│   ├── engine/                 # Orchestrator, submission pipeline, hints, quizzes
│   ├── greenfield/             # Greenfield phase controllers (A–F)
│   └── onboarding/             # Onboarding phase controllers (OB-A–OB-G)
└── apps/
    └── vscode-extension/       # VS Code extension UI & webview panels
```

## Verification & Commands

- **Install dependencies:** `npm install`
- **Build all packages:** `npm run build`
- **Run test suite:** `npm run test`
- **Check linting:** `npm run lint`
- **Check TypeScript types:** `npm run typecheck`
- **Check dependency cycles:** `npm run check:cycles`
- **Check documentation completeness:** `npm run check:docs`
- **Full Verification Gate:** `npm run verify`
