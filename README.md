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
node --env-file=.env apps/cli/dist/bin.js doctor
```

`doctor` makes no network call and spends nothing. It should end with `Ready.`

Point `node` at `apps/cli/dist/bin.js`, not at `node_modules/.bin/deepdive` — that path is a shell wrapper, and handing it to `node` is a syntax error on Windows. The CLI runs from `dist/`, so rebuild after changing source.

To type `deepdive` instead of the full path, link it once:

```bash
npm link -w apps/cli
```

The bare command then resolves on every platform, but it is not `node`, so `--env-file` is unavailable — export your key in the shell, or keep using the `node --env-file=.env apps/cli/dist/bin.js` form. The examples below are written as `deepdive` for readability; substitute whichever form you are using.

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

### The studio

`deepdive studio` is the consistency view — what a streak counter is for, applied to design rounds rather than commits:

```
DeepDive studio — ./my-project

  Rounds            6
  Approved          3 of 6
  Active days       1
  Current streak    1d
  Longest streak    1d
  Peak hour         12pm
  Hints taken       0
  Concepts mastered 0 of 2

  onboarding:  ● OB-A   ● OB-B   ● OB-C   ○ OB-D   ○ OB-E   ○ OB-F   ○ OB-G

  Mon                        
  Tue                        
  Wed                        
  Thu                       █
  Fri                        
  …
      12 weeks    less · ▪ ▣ █ more
```

Effort and outcome are deliberately kept apart. Rounds and active days say you turned up; approvals say the work landed. Collapsing them into one score would make a day of hard revision look like a bad day, which is the opposite of what this is for. A streak that ended yesterday still counts as live, so it does not read as broken every morning before your first submission.

Scope is per project, like everything else — the numbers come from that project's `.deepdive/deepdive.db`. There is no cross-project roll-up.

### When you get stuck

If the same field is flagged on two consecutive rounds, `grade` says so and points at `deepdive hint`. Hints climb a four-rung ladder — Orientation, Localization, Diagnostic, Procedural Nudge — one rung per command, each generated at the moment you ask for it:

```
$ deepdive hint
round 2, phase A, stuck on charter_goal_clarity
L1 · Orientation — on charter_goal_clarity

Think about what the user should actually be able to do with the system. A strong
goal describes the core capability from the user's perspective, not the
implementation.

Next: Localization (deepdive hint)
```

Three properties that are the whole point of the ladder:

- **L4 is the ceiling.** There is no fifth rung — not as a prompt request the model might refuse, but structurally: asking for one is an error. Every level, including L1, carries the instruction never to reveal the answer, because a model asked for a gentle hint that happens to know the answer must still not give it.
- **Reveals are unlimited and logged, not gated.** Taking hints is recorded in the completion record's hint profile as descriptive signal about your path. Nothing reads it to score you down. You cannot skip rungs, though — the ladder escalates one level at a time so each hint can build on the last.
- **Re-reading a revealed level is free** and makes no model call, so a rung never changes under you.

Steps 3 and 4 ask before each mutating command by default. Add `--auto` to let the path/command policy decide silently. Policy denials are never negotiable in either mode — no answer at a prompt lets the AI write a graded artifact.

**Codebase Onboarding** — you learn and contribute to an existing repository:

```bash
# OB-A. Clone the repo, pin the commit, state what you intend to learn
deepdive onboard https://github.com/some/project.git ./study
deepdive grade repo-charter ./charter.json --project ./study

# OB-B. Reverse-engineer the design: what the code actually does
deepdive grade rsdd ./rsdd.json --project ./study

# OB-C. Plan your reading, in dependency order
deepdive grade plan ./plan.json --project ./study

# OB-D. Get the characterization tests green (the runner decides, not a model)
deepdive characterize ./study vitest --project ./study

# OB-E. Propose a contribution
deepdive grade cdd ./cdd.json --project ./study

# OB-F/OB-G. Comprehension check, then the completion record
deepdive quiz --project ./study
deepdive complete --project ./study
```

`quiz` keeps a question bank per project and tracks mastery per concept, both of which outlive the process. The first run writes questions and banks them; later runs draw from the bank, favouring concepts you have not yet mastered, and generate only to fill a shortfall:

```
$ deepdive quiz          # first run
5 questions (5 newly written).

$ deepdive quiz          # later run — no API key needed, nothing generated
5 questions from your bank of 5.
```

A concept counts as mastered after two correct answers *and* only while most attempts on it stay correct — one right answer on a four-option question is one-in-four by guessing, and the flag is meant to say "knows this now" rather than "once got two right", so it can be lost again:

```
concept mastery:
  impl: mastered  ← newly mastered
  …
  impl: 2/3  ← no longer mastered
```

Note `repo-charter`, not `charter`: the greenfield charter says what you will build, the repo learning charter says what you intend to learn from code that already exists, and they are graded at different phases.

The commit is pinned at clone time, not resolved per submission: upstream moves, and evidence checked against a moving target would pass one day and fail the next with your work unchanged.

Three of those phases are decided without a model at all. **OB-C**: "reading units topologically ordered" is a fact about the dependency graph, so a plan that reads a caller before the thing it calls is rejected by a code check. **OB-D**: the test runner's result is the verdict — no model is constructed on that path (P-5). **OB-G**: the completion record is derived from the append-only round history, so you cannot claim a phase you never passed. **OB-F** calls a model to write the questions, but scores by exact match, so the grade is the same every time you re-run it.

Every citation in an `rsdd` is checked against that commit with git *before* any model call. A citation naming a file that does not exist is rejected for free — that check is the point of the mode, since the claim being graded is that you read the code:

```
citation check: FAILED — no model call made
  - no such file at 97f38e88: validator → src/totally-invented.ts
```

Note the asymmetry with greenfield: an onboarding workspace holds **someone else's code**, and `scaffold`/`verify` hold `bash`, so running its test suite executes that code with your file access. DeepDive has no OS sandbox right now, so it asks before doing that — once per command, and `--auto` does not answer it. Declining is the default for a non-interactive stdin.

## In VS Code

The extension is the same thing without the terminal. Build once, then press **F5** (*Run DeepDive Extension*):

```bash
npm run build
```

To use it in a normal window instead of the debug host, set `deepdive.cliPath` to your built `apps/cli/dist/bin.js`.

What it adds over the CLI:

- **Rejections appear on the line that caused them.** Grading `charter.json` puts each finding in the Problems panel, underlining the field its message names. This is the one thing the editor does that a terminal cannot.
- **A sidebar** with the phase track, the studio's consistency numbers, and round history — each round expanding into its findings.
- **The current phase in the status bar**, with the streak beside it when one is live.
- **The hint ladder as a panel**, every revealed rung on screen, with a *Reveal next* button that disappears at L4 because there is nothing above it to ask for.

Commands: `DeepDive: Grade this artifact`, `Show hint`, `Show studio`, `Refresh`, `Check configuration`.

`scaffold` and `verify` are deliberately **not** commands here. They hold tools and write files, and what protects you is being asked before each mutating command. Behind a one-click button that becomes a reflex rather than a decision, so they stay at the command line. A test asserts the manifest declares no such command, so adding one has to be deliberate.

The extension runs the CLI as a subprocess and reads `--json` rather than importing the packages. Partly because SQLite is a native module built against Node's ABI rather than the Electron ABI the extension host runs, and partly because one implementation of "what does grading a charter mean" is easier to keep honest than two.

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
    └── vscode-extension/       # VS Code extension: diagnostics, sidebar, hint panel
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

All seven onboarding phases OB-A through OB-G are reachable from the CLI, and the leveled hint ladder is wired to both modes with reveals rolling into the completion record's hint profile.

The VS Code extension is loadable and wired to the CLI: grade, diagnostics, sidebar, status bar and the hint panel all work against a real project.

Not yet wired: the `Concept` schema (prerequisites, categories) is unused — concept ids come from whatever the quiz generator labels a question with, so there is no prerequisite graph ordering what gets tested. Quiz items other than multiple choice (`structured_trace`, `invariant_explanation`) are storable but never drawn, since scoring them would need a model and the quiz would stop being deterministic.

Licensed MIT. Packages declare `files`, pinned `engines` and public `publishConfig`, and `npm pack` includes the migration SQL the built runner resolves at run time, so `npm publish --workspaces` is unblocked.
