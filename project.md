# Project.md — Guided Project Learning Platform

**Working name:** Projectpath (placeholder)
**Status:** Concept / requirements, being turned into an architecture
**Source:** Product Description v0.3 (condensed here for project tracking; see conversation history / original doc for full detail)

---

## 1. What this is

A platform that helps people design, understand, and build software without being overwhelmed — in an era where AI makes it tempting to skip thinking. It has two complementary learning modes:

| Mode | Student starts with | Outcome |
|---|---|---|
| **Greenfield** | Their own project idea | Design, build, and ship something they scoped themselves |
| **Codebase onboarding** | An existing codebase (often open source) | Understand its design, replicate that understanding in structured artifacts, and contribute to it |

In both modes, the student is the author of thinking and work. AI guides, grades, and refines — it never authors design or code on the student's behalf.

## 2. Problem it solves

- Tutorials show finished apps; real projects feel too large to start.
- Joining a team or OSS repo means hundreds of files and no map.
- Design is rarely taught as something you can *read* out of existing code, only something you write from scratch.
- "Find a good first issue" is not a learning path; students bounce off OSS contribution.
- AI tools that summarize repos or answer questions let students outsource the thinking that was supposed to be the point.
- Tests are usually run for the student, rarely taught as something the student writes.

## 3. Vision

Turn any feasible project idea, or any meaningful codebase, into a bounded, test-verified learning path where the student thinks, implements or contributes, and proves understanding — with AI that guides without thinking for them.

## 4. Non-negotiable principles

| ID | Principle |
|---|---|
| P-1 | Student is author of charter/design artifacts, implementation, contribution plans, and test strategy |
| P-2 | AI guides, grades, refines — never authors design docs, walkthroughs, or solution code |
| P-3 | No chatbot — structured forms, leveled hints, rubrics, quizzes only (refined during design: chat-*shaped* UI is fine as long as AI turns stay schema-constrained — see architecture.md) |
| P-4 | Bounded phases — entry/exit criteria on every phase (round *caps* specifically were dropped once the product went local-only with no queue to route unresolved cases to — see architecture.md) |
| P-5 | Tests are authoritative — deterministic pass/fail; AI never overrides |
| P-6 | Understanding verified twice — automated checks + comprehension quizzes |
| P-7 | Progressive scaffolding — support decreases as demonstrated competence grows |
| P-8 | Concepts are need-based — math, algorithms, core ideas taught when the project/codebase requires them |
| P-9 | Research is valid learning — structured research with rubric grading |
| P-10 | Confidence through structure — one level at a time, never the whole mountain at once |
| P-11 | Real-world grounding (onboarding mode) — paths lead to authentic codebase reading and real or realistic contribution workflows |

## 5. Target users

**Primary:** career switchers building portfolio projects or first OSS contributions; junior developers who freeze on open-ended work or unfamiliar repos; self-taught programmers learning a stack through a project they chose; developers preparing to contribute to a specific open source project they care about.

**Secondary:** educators running project-based or "read real code" courses; bootcamp graduates moving from toy apps to industry codebases.

**Explicitly not replacing:** production incident response or senior staff onboarding; AI coding assistants used for implementation speed; fully automated repo summarizers where the student is passive.

## 6. Greenfield mode — phase summary

| Phase | Summary |
|---|---|
| A — Ideation | Student proposes project; AI refines via structured prompts; bounded rounds; produces an Accepted Project Charter |
| B — System design | Leveled, student-authored System Design Document (SDD); AI rubric-grades; no AI-drafted design |
| B.5 — Learning needs | AI proposes concepts/algorithms/math/research; student co-selects |
| C — Module plan | AI decomposes the approved SDD into modules, with AI tests and student test obligations |
| D — Module execution | Progressive scaffolding; student code + student tests + mandatory AI tests; leveled hints |
| E — Quizzes | Project comprehension checks + off-project concept drills |
| F — Completion | Design-vs-implementation review; final exam; portfolio record |

## 7. Codebase onboarding mode — phase summary

| Phase | Summary |
|---|---|
| OB-A — Contribution intent & repo charter | Student picks/specifies a repo and states intent (learn / contribute / replicate understanding); AI returns structured refinement (tier, risks, MVP scope), never the architecture itself; produces a Repo Learning Charter |
| OB-B — Reverse system design | Student produces a Reverse System Design Document (RSDD) by reading the codebase, leveled OB-B-L1 through L7, with file/module citations required; AI grades against the real repo, never authors it |
| OB-C — Reading plan & exercise decomposition | AI orders reading/contribution units topologically (entry points → domain → leaves); mandatory verification tests and student test obligations per unit |
| OB-D — Reading & trace execution loop | Locate / trace / predict / characterize / minimal-change / explain-invariant exercises; scaffolding shifts from "no tour" to worksheets to reuse of the student's own prior trace artifacts |
| OB-E — Contribution path | Issue selection → student-authored Contribution Design Doc (graded against the RSDD and repo conventions) → implementation → PR prep → review (real, fork, sandbox, or simulated, in that preference order) |
| OB-F — Quizzes | Repo-aligned comprehension, design-replication drills on a different subsystem, shared off-project concept drills |
| OB-G — Completion | Approved RSDD, all reading units verified, concept drills passed, contribution complete (merged / sandbox-approved / maintainer sign-off), final exam, completion record |

## 8. Shared infrastructure across both modes

Hint system (leveled, non-chat in intent), concept catalog, skill graph, quiz engine, test runner, progress gates, completion records. Mode-specific: artifact types (SDD vs RSDD), exercise types (implement vs trace/explain/contribute), scaffolding sources (stubs vs repo checkout).

## 9. Verification philosophy

Greenfield leans on AI-generated tests derived from the SDD. Onboarding leans on repo-grounded verification: the project's own existing test suite (must pass locally before contribution), platform verification checks (structured-answer and trace-completeness), characterization tests the student writes to document current behavior before changing it, and a regression gate (full suite green) after any change. In both modes, test results are treated as ground truth and are never something the AI can override or reinterpret.

## 10. MVP scope

- **Vertical slice A — Greenfield:** a single language/stack track (Rust CLI in the original spec), full A–F phase arc.
- **Vertical slice B — Codebase onboarding:** one curated OSS repo (or small maintained mirror), OB-A through a subset of OB-B (RSDD L1–L5), 4 reading units, 1 contribution milestone (sandbox PR acceptable), characterization test + Contribution Design Doc gate.
- Both slices share one hint/quiz/drill engine, proving the unified platform rather than two disconnected products.

## 11. Document history

- v0.1–v0.3 (original product description): vision, principles, teaching philosophy, full competitive landscape, both learning modes.
- This project.md (derived): condensed working reference for the build; architecture decisions now tracked separately in [architecture.md](architecture.md).
