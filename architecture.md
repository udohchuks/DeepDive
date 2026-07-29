# Architecture.md — Guided Project Learning Platform

Companion to [project.md](project.md). Documents the technical decisions made so far and the reasoning behind them. This is a living document — update it as decisions change, and keep the reasoning, not just the conclusion, since the reasoning is what lets future decisions stay consistent.

---

## 1. Execution environment

**Decision: VS Code, via an extension. Not a custom-built IDE.**

The platform does not build its own code editor. Students write and edit code in VS Code as normal; the platform's contribution is a VS Code extension that adds webview panels alongside the editor — the artifact editor's structured fields, the design-review thread, the hint ladder, and phase/gate status.

**Why:** Codebase Onboarding mode requires real git, real toolchains, real build systems, and often large local checkouts of arbitrary OSS repositories across arbitrary languages. A browser-sandboxed IDE (Replit-style) would mean rebuilding a general-purpose dev environment inside a sandbox for every possible language and repo — an open-ended cost unrelated to the product's actual value. VS Code already solves this, for free, on the student's own machine, and the same choice serves Greenfield mode too, so the platform needs only one execution surface for both.

## 2. Agent harness

**Decision: [pi](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`), specifically its `coding-agent` package, as the tool-calling substrate for every AI role in the system.**

Pi is a minimal, extensible TypeScript coding-agent harness: four built-in tools (`read`, `write`, `edit`, `bash`), no sandboxing of its own, no built-in planning or sub-agents, session history as JSONL with branching, and an RPC/SDK embedding mode (`createAgentSession()`) for use inside another application rather than as a standalone terminal tool.

**Why pi, given the product's "AI never authors" principle (P-2):** pi's default tool set (`read`/`write`/`edit`/`bash`) is shaped for an agent that *does* the coding — the opposite of what P-2 asks for on its face. The resolution reached during design: P-2 was never "AI never writes anything," it's "AI never writes the artifact being graded as the student's own." The product's own spec already has AI authoring test files and scaffolding stubs. Given that, pi's tool set fits cleanly as long as write/edit/bash access is scoped away from graded artifacts — which pi supports via its extension system (see §4). Pi is used only as the local tool-calling and session-management substrate; it does not define the product's workflow, forms, or grading logic.

**Relevant SDK details confirmed during design:**
- `createAgentSession({ tools, excludeTools, customTools, ... })` supports per-session tool allowlisting (e.g. a read-only Verifier session with only `read`/`grep`/`find`/`ls`) and `noTools: 'all'|'builtin'`.
- `customTools` lets a session's output be forced into a schema (e.g. a `submit_rubric_verdict` tool) instead of free text, keeping grading output structured.
- The `tool_call` lifecycle hook fires before a tool executes and can return `{ block: true }` — this is the mechanism used for path-scoped write permission (see §4), since pi has no native path-level restriction, only whole-tool allow/exclude lists.

## 3. Agent roles

The system runs pi in multiple role-scoped sessions rather than one general-purpose session:

| Role | Tools | Purpose |
|---|---|---|
| **Scaffolder** | `write`, `edit`, `bash` — scoped to scaffold/test paths only | Writes stub files, boilerplate, and test harnesses during progressive scaffolding; never writes into a file that is itself the graded artifact |
| **Verifier** | `read`, `grep`/`find`, `bash` (read-only commands) | The only role that reads raw repository or student-submitted text; checks citations, traces call chains, confirms behavior; runs the project's real test suite and reports results as-is |
| **Grader / Hint** | none (no filesystem tools) | Consumes only structured, labeled findings passed up from the Verifier — never raw repo/student text; emits structured verdicts (`questions`, `flags`, `hint_ref`) via a `customTool`, never free-form prose proposing a design or solution |

**Why split by role instead of one session with all tools:** it makes the "AI never authors graded work" principle enforceable by construction rather than by hoping the model behaves. A Grader session that has no `write` tool physically cannot edit the student's design document, regardless of what it's asked to do.

## 4. Permission / write-scope enforcement

Pi has no native path-level permission model — tool access is granted per whole tool, not per directory. The product enforces path scope itself, as a pi extension using the `tool_call` hook: before a `write`/`edit`/`bash` call executes, the extension checks the target path (or command) against a policy for the current phase (e.g., "Scaffolder may write to `/scaffold` and `/tests` during Module Execution, never to the student's module file once they've started it") and blocks anything out of scope.

This is the actual mechanism behind P-2 in this architecture, not a restriction on pi as a tool, but a policy layer built on top of it.

## 5. Sandbox

**Decision: OS-native process sandboxing, wrapping the student's existing local development environment — not containers, not microVMs.**

- Linux: bubblewrap + seccomp-bpf.
- macOS: Seatbelt.
- Windows: no native equivalent exists (bubblewrap needs kernel features WSL1 lacks); requires WSL2. This is the same constraint Claude Code has on Windows.

This is the same approach used locally by Claude Code and Cursor, as opposed to the Docker/Podman-container approach used by OpenHands and Gemini CLI. Container sandboxing was considered because it would also solve multi-toolchain provisioning for Codebase Onboarding mode (each repo gets a container image matching its language/toolchain) — but this was explicitly not the priority. Security and isolation strength are not a priority for this product; the deciding factor was staying wrapped around whatever the student already has locally, with the sandbox scoping what a pi session can touch rather than provisioning an environment for them.

**Consequence accepted:** OS-native sandboxing shares the host kernel — it stops filesystem-scope violations, not kernel-level exploits. Given the "security is not a priority" decision, this tradeoff was made deliberately, not by omission.

## 6. Prompt injection posture (Codebase Onboarding mode)

Onboarding mode feeds arbitrary third-party OSS repository content (READMEs, issues, code comments) into agent context, which is a known injection surface for coding agents — a payload can hide in a comment, string literal, or identifier and be interpreted as an instruction.

**Mitigation, following the dual-LLM / quarantine pattern:** only the Verifier role (§3) ever reads raw repo or student text. Everything it passes to the Grader/Hint role is a structured, pre-labeled finding (e.g. `{ path: "src/matcher.rs", line: 142, claim: "citation confirmed" }`), never raw text. The Grader, which is the role with the most consequential output (rubric verdicts, gate decisions), never sees anything an attacker could have written.

## 7. System topology

**Decision: fully local. No backend service operated by the product.**

Everything — phase state, gate decisions, artifacts (SDD/RSDD/CDD), rubric definitions, the skill graph, quiz bank, and completion records — lives in local storage on the student's machine, managed by a local orchestrator component alongside the VS Code extension. There is no cloud service that owns round caps, grading, or progress state.

**Two things leave the machine, and only two:**
- **AI model API calls** — the pi sessions' underlying model inference is remote; the tool-calling loop and all filesystem/bash access stay local.
- **Git / GitHub operations** — cloning repos and, in Onboarding mode, pushing branches and opening PRs. This isn't a service choice, it's inherent to "contribute to a real OSS project."

**Consequences accepted as deliberate tradeoffs, not oversights:**
- **No round cap.** The product's original spec called for bounded revision rounds per level (P-4), with unresolved cases routed to manual/human review. With no backend, there's no queue to route to, so the cap was removed — students get as many review rounds as they need until a level is approved. The *bounded phases* principle (entry/exit criteria) still holds; only the numeric round ceiling was dropped.
- **No tamper-resistant source of truth — decided, not deferred.** Round history, gate state, and completion records are computed and stored entirely on a machine the student controls, and stay that way. A completion record generated and stored locally is not independently verifiable by a third party (an employer, a maintainer) the way a service-attested record would be. A git-commit-chain-plus-GitHub-timestamp scheme was considered during design (hash-chained phase-approval commits, witnessed by GitHub's server-side receive time) and explicitly rejected as unnecessary engineering for a product that already treats security/tamper-resistance as a non-priority (§5). No dedicated repo, no signing, no witness mechanism — the record is a plain local artifact and that's final for this architecture.

## 8. Student-facing interaction model

**Decision: chat-*shaped* UI, not a chatbot.** Every artifact level (an SDD/RSDD section, a CDD) gets a bounded design-review thread, scoped to that section, that opens automatically when the student submits a draft.

- The AI's turn is never free prose. It always renders as a structured card: a rubric status pill, a `Questions` list (Socratic — prompts the student to reason, never gives the answer), a `Flags` list (contradictions against citations, the repo, or the rubric), and an optional pointer into the leveled hint ladder (L1–L4) if the rubric detects the student is stuck rather than simply wrong.
- The student has exactly two moves in the thread: ask a clarifying question about the feedback itself (a narrowly labeled input, not a general chat box), or revise the artifact, which reopens the structured editor and posts a new AI turn on resubmission.
- The thread closes the moment the rubric passes: it collapses to a read-only, labeled "Approved" history block, and reopens only if that level is explicitly reopened later.
- The artifact being reviewed is itself structured (typed fields — e.g. modules, dependencies, each dependency requiring a file/line citation) rather than freeform markdown, so both the student's editor and the AI's flags can point at the exact same field. A missing-citation flag in the review thread corresponds to a highlighted field in the editor, not a paragraph the student has to go hunting through.

## 8b. Hint ladder (L1–L4)

Attached to a single AI turn in the review thread (§8), not global to the project or session.

- **Four levels, each with a fixed content rule, not just an example difficulty curve:**
  - **L1 — orientation:** general strategy, no reference to the specific artifact.
  - **L2 — localization:** points at the relevant existing citation/module/flow without naming the fix.
  - **L3 — diagnostic:** names the concrete failing signal (a symbol, a specific citation, a specific test).
  - **L4 — procedural nudge:** a concrete next *action* the student should take, never the content of the answer.
- **L4 is a hard ceiling in every phase of both modes.** No level, and no proactive escalation (see below), ever crosses from procedure into content — the AI does not hand over the design, the fix, or the code, no matter how many attempts a student has made. This was reaffirmed explicitly during design after considering and rejecting a version where repeated failure would eventually surface the answer; that version was rejected because it would let students grind past the review process instead of resolving it, undermining the same "AI never authors" principle (P-2) that differentiates this product from generic AI tutors (project.md §14.2 equivalent).
- **Reveals are sequential and stacked**, not replaced — opening L3 leaves L1 and L2 visible above it, both as a soft deterrent against jumping straight to the near-answer and as a visible trail for the student's own later reflection.
- **Unlimited reveals**, consistent with the no-round-cap decision in §7 — no artificial scarcity gating how many hints a student can open. Content is generated lazily, per level, at the moment of reveal (§12) — not pre-computed, so opening a level carries a brief generation delay rather than being instant.
- **Proactive, AI-initiated offers — struggle-detection threshold, locked:**
  - **Signal source:** only full resubmissions count (a new pass through Verifier + Grader, §12). Clarifying-question exchanges never trigger this — they don't produce a new flag to compare against.
  - **Unit tracked:** the field the Grader designates as that turn's primary sticking point — the same field the turn's hint ladder is already attached to (the ladder is per-turn, not per-flag, so detection follows the same granularity). Exact field-ID match, not fuzzy text matching, since flags are already tied to structured artifact fields (§8).
  - **Threshold:** the same field is the primary flag across 2 consecutive resubmissions. Fires the moment the 2nd occurrence's verdict renders.
  - **What fires:** an unprompted offer to reveal the next unrevealed level in that turn's ladder — never skips ahead, same sequencing as a manual reveal.
  - **Reset:** consecutive only. The streak drops to 0 the instant that field stops being the turn's primary flag (fixed, or superseded by a more pressing issue). A field that resurfaces later starts a fresh count.
  - **Scope:** per artifact-level thread, independent across levels.
  - This is what "proactive" means here: initiative on *when to offer*, never a change to *what the ceiling allows* (§8b above).
- **Logged, not gated.** Every reveal (level, timestamp, turn) is recorded locally and rolls into the hint profile that's part of the completion record (project.md §7/§9, OB-G) — descriptive signal about the learning path, not a penalty.

## 9. Tools and technologies chosen so far

| Area | Choice | Status |
|---|---|---|
| Code editor / IDE | VS Code, via a custom extension | Decided |
| Agent harness | [pi](https://github.com/earendil-works/pi) (`@earendil-works/pi-coding-agent`), `coding-agent` package, RPC/SDK embedding mode | Decided |
| Sandbox — Linux | bubblewrap + seccomp-bpf | Decided |
| Sandbox — macOS | Seatbelt (`sandbox-exec`) | Decided |
| Sandbox — Windows | WSL2 required (no native path) | Decided, flagged as a real onboarding constraint |
| Backend/cloud service | None — fully local application | Decided |
| AI model provider | BYO API key, pluggable, Claude API as the default | Decided |
| Local storage | SQLite, embedded, single file per project | Decided |
| Windows without WSL2 | Blocked, no degraded fallback in v1 | Decided |
| Round-trip / sequence flow for a single submission | Detailed in §12 | Decided |
| Hint-ladder (L1–L4) interaction design | Detailed in §8b | Decided |

## 9b. AI model provider

**Decision: student brings their own API key; no billing infrastructure of any kind.** Consistent with §7 — there's no backend to meter usage or invoice through, so the student pays their model provider directly. The provider is kept pluggable rather than hardcoded, since pi's SDK already exposes `model` / `modelRuntime` as configuration rather than a fixed dependency (§2). Claude's API is the out-of-the-box default given the product's own agent-harness lineage, not an exclusive requirement.

**Consequence carried forward from §12:** every submission round makes at least two separate model calls (Verifier's reasoning, Grader + hint's single structured call) — cost is the student's own, but worth surfacing during onboarding/setup so it isn't a surprise.

## 9c. Local storage

**Decision: SQLite, not Turso/libSQL.** Turso's entire value proposition — embedded replicas syncing against a hosted cloud primary, built for multi-region reads and multi-device continuity — is the thing §7 explicitly ruled out. Run in pure local, no-sync mode, it offers nothing over plain SQLite except an extra dependency and a service relationship in the loop for zero functional gain. SQLite is embedded, single-file, zero-server, with mature Node bindings (`node:sqlite` is built into recent Node versions), and matches the local-only architecture with no unnecessary moving parts.

One SQLite file per project (or per student install, TBD at implementation time) holds artifacts, rubric definitions, the skill graph, quiz bank, round/thread history, hint reveal logs, and completion records — everything §7 already said lives in "local storage."

**Flagged, not resolved:** if cross-device sync becomes a real goal later, that reopens the "no backend" decision in §7 — it is not something SQLite vs. Turso can solve as a storage-format choice alone. (Third-party-verifiable completion records were considered and explicitly declined, §7.)

## 12. Submission sequence flow

One full cycle of the review thread (§8), from a student's "Submit for review" click to a verdict rendering back in the panel.

1. Student edits the structured artifact in the VS Code extension and clicks "Submit for review."
2. VS Code extension sends the submission (content, phase/level, target repo paths) to the Local orchestrator, which loads the rubric and round history from Local storage and dispatches a sandboxed **Verifier** session, read-only into the student's workspace.
3. Verifier reads the submission and the relevant repo files — the only role that ever touches this raw text (§6) — checks citations, traces referenced flows, and calls the AI model API as needed for its own reasoning.
4. Where the level requires it (OB-D characterization tests, Greenfield D module tests), Verifier also invokes the local **Test runner** and captures its pass/fail output verbatim. Conditional — not every submission triggers this.
5. Verifier reduces everything to structured findings only (e.g. `"core → matcher: no citation found"`, `"suite: 41 passed, 2 failed"`) and hands them to a **Grader + hint** session, which has no filesystem tools and never sees raw repo/student text — only what Verifier already reduced. It makes one AI model call and returns a single structured output: the rubric verdict and the Questions/Flags lists. It does **not** generate hint ladder content at this point — hints are generated lazily, per level, only when actually requested (see below).
6. Local orchestrator writes the turn to Local storage — thread history and round count (uncapped, just counted) — and updates gate state.
7. Verdict renders in the VS Code review panel; flags highlight the specific editor fields they point at.
8. Three exits: **approved** → thread closes, next phase unlocks (Onboarding contribution milestones hand off to a separate git/PR flow from here, outside this loop); **needs revision, student revises** → back to step 1, a new uncapped round; **needs revision, student asks a clarifying question first** → routes only to the Grader + hint session, same schema-constrained response, no new repo access, no answer given.
9. **Hint reveal (manual or proactive) is its own lightweight call, not something pulled from storage.** When the student clicks "Reveal" on a level, or accepts a proactive offer triggered by the struggle-detection threshold (§8b), the Local orchestrator makes a small, separate AI call to the Grader + hint session, scoped to just that one level — passing the relevant flag/question, the artifact, and any levels already revealed so it stays consistent with them. Still no new Verifier pass, no new repo access — this call only ever draws on findings already reduced in step 5.

**Decided: lazy, per-level generation, not upfront.** An upfront-single-call design was considered (§8b) and rejected: generating all four levels at grading time freezes their content before the student has had a chance to ask a clarifying question in between, and most turns never need more than L1 or L2 anyway, so paying for L3/L4 content that's never revealed was pure waste most of the time. Lazy generation costs a bit more latency at the moment a hint is actually opened (a brief generation delay instead of an instant reveal), and adds up to four extra small AI calls in the worst case where a student climbs the full ladder — but each call is cheap, and content can incorporate anything that happened since grading.

**Cost/latency note:** a submission round now makes 2 AI calls at minimum (Verifier's reasoning in step 3, Grader's verdict in step 5), plus one additional small call per hint level actually revealed (up to 4 more in the rare full-ladder case) — worth keeping in mind once model provider and pricing are decided (§9b).

## 12b. Diagrams

- [System architecture](diagrams/system-architecture.svg) — the local application boundary, its components, and the two things that leave the machine (§7).
- [Agent roles and permission scoping](diagrams/agent-roles-permissions.svg) — how the Scaffolder, Verifier, and Grader + hint sessions differ in tool access, and how raw repo text is contained to the Verifier alone (§3, §4, §6).
- [Submission sequence flow](diagrams/submission-sequence.svg) — the numbered step-by-step for one review round, including lazy hint generation (§12).

## 13. Open decisions carried forward

None outstanding as of this revision — every item raised during design has been decided and documented in the sections above. Add new entries here as new questions surface.

## 14. Document history

- This is the first version of architecture.md, written after interface/interaction design (VS Code + design-review thread) and system architecture design (pi roles, sandboxing, local-only topology, hint ladder mechanics, submission sequence flow, model/storage choices) were worked through in full. See [project.md](project.md) for the product-level description these decisions serve.
