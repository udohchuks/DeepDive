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

Then work through a project. **Greenfield** — you design and build your own:

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

**Codebase Onboarding** — you learn and contribute to an existing repository:

```bash
# 1. Clone the repo and pin the commit you will be graded against
deepdive onboard https://github.com/some/project.git ./study

# 2. Grade your charter, then your reverse SDD: what the code actually does
deepdive grade charter ./charter.json --project ./study
deepdive grade rsdd ./rsdd.json --project ./study

# 3. Propose a contribution
deepdive grade cdd ./cdd.json --project ./study
```

The commit is pinned at clone time, not resolved per submission: upstream moves, and evidence checked against a moving target would pass one day and fail the next with your work unchanged.

Every citation in an `rsdd` is checked against that commit with git *before* any model call. A citation naming a file that does not exist is rejected for free — that check is the point of the mode, since the claim being graded is that you read the code:

```
citation check: FAILED — no model call made
  - no such file at 97f38e88: validator → src/totally-invented.ts
```

Note the asymmetry with greenfield: an onboarding workspace holds **someone else's code**, and `scaffold`/`verify` hold `bash`, so running its test suite executes that code with your file access. DeepDive has no OS sandbox right now, so it asks before doing that — once per command, and `--auto` does not answer it. Declining is the default for a non-interactive stdin.

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

Every command that produces a result records a round: `grade` under the rubric's phase, `scaffold` under phase C and `verify` under phase D. An agent run has no verdict — no rubric judged it — so it is recorded with status `completed` and tagged with the role that ran it. `history` shows all of them in one sequence, which is the point: it puts a verify run between the rejected charter and the approved one, where it happened.

Codebase Onboarding is runnable from the CLI: `onboard` clones and pins, and `grade rsdd` / `grade cdd` are wired with repo-grounded citation checking. Running a cloned repository's test suite is gated on an explicit prompt rather than an OS sandbox — that is a deliberate, stated trade-off, not a finished isolation story, and process isolation is still the right answer before this is put in front of students who will paste in arbitrary repository URLs.

Not yet wired: the VS Code extension is not a loadable extension. Phases OB-C, OB-D, OB-F and OB-G have validators but no CLI command, so the onboarding path currently covers the charter, the reverse SDD and the contribution proposal, not the guided reading plan or the quiz.

Licensed MIT. Packages declare `files`, pinned `engines` and public `publishConfig`, and `npm pack` includes the migration SQL the built runner resolves at run time, so `npm publish --workspaces` is unblocked.
