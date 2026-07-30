# DeepDive — Guided Project Learning Platform

DeepDive is a local-only platform that helps developers design, understand, and build software through structured, test-verified learning paths without outsourcing their thinking to AI.

The AI scaffolds tests, verifies work, and grades against rubrics. It never writes the design documents or the implementation the learner is graded on.

## Quickstart

Requires Node **22.19.0** (see `.nvmrc`).

```bash
npm install
npm run build
```

Configure a provider. Either copy `.env.example` to `.env` and add a key, or — if you already use pi — just `pi login` and skip the file entirely:

```bash
node --env-file=.env node_modules/.bin/deepdive doctor
```

`doctor` makes no network call and spends nothing. It should end with `Ready.`

Then work through a project:

```bash
# 1. Grade your project charter (exits non-zero until approved)
deepdive grade charter ./charter.json

# 2. Grade your software design document
deepdive grade sdd ./sdd.json

# 3. Have the Scaffolder write failing tests from your design
deepdive scaffold ./workspace "Read sdd.json and write failing tests under tests/"

# 4. You implement the modules, then have the Verifier review
deepdive verify ./workspace "Do the tests cover the modules in sdd.json? Report gaps."

# 5. Review every round you have submitted
deepdive history
```

Each `grade` is saved to `<project>/.deepdive/deepdive.db`. Rounds are append-only, so a rejected attempt stays in the record next to the approved one — that history is the point.

Steps 3 and 4 ask before each mutating command by default. Add `--auto` to let the path/command policy decide silently. Policy denials are never negotiable in either mode — no answer at a prompt lets the AI write a graded artifact.

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
│   ├── policy/                 # Path & command policy (in-process access checks)
│   ├── provider/               # BYO-key AI model provider abstraction
│   ├── agent/                  # pi SDK harness, role sessions, tool gate, quarantine
│   ├── vcs/                    # Git / GitHub integration
│   ├── content/                # Rubrics, role prompts, hint level rules
│   ├── engine/                 # Orchestrator, submission pipeline, test runner
│   ├── greenfield/             # Greenfield phase controllers (A–F)
│   └── onboarding/             # Onboarding phase controllers (OB-A–OB-G)
└── apps/
    ├── cli/                    # `deepdive` command-line entry point
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

## Status

Greenfield mode is runnable end to end from the CLI: charter → SDD → scaffolded tests → verification.

Not yet wired: Codebase Onboarding has phase controllers but no CLI command, and the VS Code extension is not yet a loadable extension. `scaffold` and `verify` runs are not yet recorded as rounds — only `grade` is. Onboarding will need process isolation restored before it ships, since it runs a cloned third-party repository's test suite.
