# VCS Version Control Port & Implementations

**Package:** @deepdive/vcs  ·  **Build step:** 6.1  ·  **Architecture ref:** §7

## What it does
Provides the version control abstraction (`Vcs` port), `GitVcs` for executing real git commands, and `FakeVcs` for deterministic testing. Git and GitHub are one of only two things that leave the machine (architecture.md §7).

## How it works
1. **GitVcs:** wraps local git (`clone`, `checkoutCommit`, `createBranch`, `getDiff`, `getStatus`, `getLog`, `commit`, `getHeadCommitSha`, `fileExistsAtCommit`).
2. **FakeVcs:** in-memory fake tracking clones, checkouts, branches, and diff output with no network or CLI execution.

**Command construction is security-relevant.** Every git call uses `execFile` with an argument array — never `exec` with an interpolated shell string. No shell is spawned, so student-authored values (commit messages in OB-E, repo URLs, branch names, citation paths) cannot escape their argument position. Operands that git would read as options are rejected up front by `assertNotOptionLike`, and `clone`/`checkoutCommit` pass `--` before user operands.

## How to use it
```typescript
import { GitVcs, FakeVcs } from '@deepdive/vcs';

const git = new GitVcs();
const sha = await git.commit(repoPath, studentAuthoredMessage); // safe: argv, not shell
const log = await git.getLog(repoPath, 10);

const fake = new FakeVcs(); // use in tests; never touches the filesystem
```

## Constraints & gotchas
- Requires host `git` on PATH.
- `getLog` throws on a non-positive or non-integer `maxCount`, and on a repository with no commits (git itself exits non-zero).
- Any new method **must** use `execFileAsync` with an argument array. Reintroducing `exec` with a template string reopens the injection hole that `vcs.test.ts` guards.
- `createPullRequest` is still a stub returning a synthetic URL — real GitHub PR creation is not implemented yet.

## Tests
`packages/vcs/tests/vcs.test.ts` — FakeVcs behavior, plus `GitVcs` exercised against a real temporary git repository. Two tests are marked PROTECTED INVARIANT: a commit message containing shell metacharacters, and one containing command substitution, must be stored verbatim and never executed.

Command: `npm --workspace=packages/vcs run test`
