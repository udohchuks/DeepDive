# Try DeepDive in ten minutes

One path, start to finish. Every command here was run before it was written down, and the output is real.

## 0. Build once

```bash
npm install
npm run build
```

## 1. Check it can run

```bash
node apps/cli/dist/bin.js doctor
```

```
env file     : C:\Users\chukw\DeepDive\.env
permissions  : approve (default)
provider     : deepseek
model        : deepseek-v4-flash
credential   : found (environment)

Ready.
```

`doctor` makes no network call and spends nothing. If `credential` says MISSING, put a key in `.env` at the top of this repo (copy `.env.example`), or run `pi login`. The `env file` line tells you which file was actually read — the nearest `.env` at or above your project.

## 2. Make a project and grade something

```bash
mkdir try
cp examples/greenfield/charter.json try/
node apps/cli/dist/bin.js grade charter try/charter.json --project try
```

The starter charter is deliberately incomplete, so this is rejected — for free, with no model call:

```
deterministic gate: FAILED — no model call made
  - [error] BOUND_VIOLATED on charter_scope_bounded
      "scopeBounds" must be a non-empty array naming what this project will not do.

saved as round 1
```

**A non-zero exit is normal here.** `grade` exits 1 until a submission is approved, so it works in a script or a pre-commit hook.

## 3. Fix it and resubmit

Add the missing field to `try/charter.json`:

```json
{
  "title": "Bookmark Deduplicator",
  "goal": "Merge two exported bookmark files into one.",
  "scopeBounds": ["No browser extension", "Netscape HTML exports only"]
}
```

```bash
node apps/cli/dist/bin.js grade charter try/charter.json --project try
```

Now the deterministic gate passes and the model actually judges the work:

```
deterministic gate: passed
calling model for 1 judged criterion/criteria…
verdict: revise
  - not met charter_goal_clarity: The goal statement is too terse … it states the
    mechanical action but does not articulate the problem domain or what the
    student is expected to learn.

saved as round 2
```

**This is the product working, not failing.** It read your goal and told you what is thin about it. Rewrite the goal — say what a user can do and what you intend to learn — and run it again until it says `approved`.

The wording will not match this page exactly, and the verdict may come back `clarifying_question` instead of `revise` when the Grader wants something spelled out before it will judge. Both mean the same thing for you: revise and resubmit. Only the deterministic gate in step 2 is identical every run — that is what "deterministic" is buying.

## 4. When you are stuck

Flag the same field twice and `grade` points you here:

```bash
node apps/cli/dist/bin.js hint --project try
```

Each call climbs one rung: Orientation → Localization → Diagnostic → Procedural Nudge. L4 is the ceiling — no rung gives you the answer. Re-reading a rung you already have is free and makes no model call.

## 5. See your history

```bash
node apps/cli/dist/bin.js history --project try
node apps/cli/dist/bin.js studio --project try
```

Rounds are append-only: the rejected attempt stays next to the approved one, because that record is the point.

## 6. Same thing in the editor

```bash
npm run build
```

Press **F5** → *Run DeepDive Extension*. In the new window, open your `try` folder, open `charter.json`, and run **DeepDive: Grade this artifact** from the command palette (or the ✓ in the editor title bar).

The difference from the terminal: each finding appears in the **Problems** panel, underlining the field its message names. The **DeepDive** icon in the activity bar holds progress, streaks, and round history.

If grading reports a missing key in the editor, it is looking for a `.env` at or above the folder you opened — not the one in this repo. Either copy it there, or set `deepdive.cliPath` and keep the key in your real environment.

## What to do next

Nothing here is throwaway — `try` is a real project. Continue with your own charter, or start the other mode:

```bash
node apps/cli/dist/bin.js onboard https://github.com/some/project.git ./study
```

That clones a repository, pins the commit you will be graded against, and starts the seven onboarding phases. See the README for the full sequence.
