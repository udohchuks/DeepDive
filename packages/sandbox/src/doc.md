# Sandbox & Isolation Policy

**Package:** @deepdive/sandbox  ·  **Build step:** 2.1, 2.2  ·  **Architecture ref:** §5

## What it does
Provides platform preflight detection, OS-native process sandbox wrappers (`bubblewrap` on Linux, `sandbox-exec` on macOS, WSL2 on Windows), path canonicalization policy evaluation, and command read-only/mutating classification.

## How it works
`runPreflight()` probes host capabilities and **fails closed on every platform**: Linux without `bwrap` and macOS without `sandbox-exec` both return `unsupported`, and Windows without WSL2 returns `windows-blocked`, each with actionable remediation text. A missing facility is never reported as "supported with a warning". `createSandboxWrapper()` returns the wrapper for supported platforms and throws `UnsandboxedExecutionBlockedError` otherwise, so no unsandboxed fallback path exists.

Policy translation is separated from execution so it can be tested without spawning anything:

- `buildBubblewrapArgs(options)` produces the bwrap argv. Nothing is visible inside the sandbox unless explicitly bound, so an empty mount policy grants no filesystem access. Read-only paths use `--ro-bind`, writable paths `--bind`, and blocked paths are masked with `--tmpfs` **last**, so a block always overrides an overlapping bind. `--unshare-all` and `--die-with-parent` are always set, and `--` terminates options before the command.
- `buildWsl2Args(options)` translates every policy path from Windows form to its WSL2 mount point via `toWslPath`, then delegates to `buildBubblewrapArgs`, producing `wsl.exe --exec bwrap <same args as Linux>`. The mount policy therefore means exactly the same thing on Windows as on Linux.
- `buildSeatbeltProfile(mountPolicy)` produces an SBPL profile that is `(deny default)` plus `(deny network*)`, granting only the system paths needed to exec a binary and the policy's own paths. Blocked paths are emitted last for the same override reason. Path values are escaped for SBPL string literals.

`PathPolicyEvaluator` canonicalizes target paths (resolving `../` traversal and symlink escapes) and checks against read-only, read-write, and explicitly blocked path policies. `classifyCommand` categorizes CLI invocations into read-only vs mutating operations.

## How to use it
```typescript
import { runPreflight, createSandboxWrapper, PathPolicyEvaluator } from '@deepdive/sandbox';

const preflight = runPreflight();
if (!preflight.isSupported) {
  console.error(preflight.remediationText);
} else {
  const wrapper = createSandboxWrapper(preflight);
}

const evaluator = new PathPolicyEvaluator({
  readOnlyPaths: ['/repo'],
  readWritePaths: ['/repo/tests'],
  blockedPaths: ['/etc'],
});
const check = evaluator.evaluateWriteAccess('/repo/tests/unit.test.ts');
```

## Constraints & gotchas
- Windows without WSL2 is a hard block — no unsandboxed fallback is permitted.
- `PathPolicyEvaluator` requires path canonicalization before matching to prevent symlink escape attacks.
- Windows requires **both** WSL2 and bubblewrap installed *inside* it. WSL2 on its own is a VM boundary, not a path-level policy, so preflight blocks with install instructions when bwrap is missing in the VM.
- Windows paths are translated to `/mnt/<drive>/...` before the policy is applied. UNC paths (`\\server\share`) and relative paths cannot be expressed inside WSL2 and are **rejected**, not guessed at — a mount policy that silently dropped a path would grant or deny the wrong thing. Translation failure fails the run; it never falls through to an unsandboxed execution.
- **Preflight now probes for real.** The default `commandExists` was a stub returning `false` unconditionally, with a comment claiming a production probe was injected at runtime — nothing ever injected one. Preflight therefore reported "unsupported" on *every* machine, including ones with a working sandbox, and the bug hid because its output was indistinguishable from a genuinely missing facility. `probeCommand` now runs the command (argv array, no shell) and treats any non-zero exit, timeout, or spawn error as false.
- Real out-of-boundary execution is verified only on Linux with bubblewrap installed. On other hosts those two tests skip and emit an explicit warning; CI installs bubblewrap so they always run there.

## Tests
Covered by `packages/sandbox/tests/preflight.test.ts`, `packages/sandbox/tests/policy.test.ts`, and `packages/sandbox/tests/isolation.test.ts` — the last covering fail-closed preflight, wrapper selection, bwrap argv construction, Seatbelt profile construction, and real sandboxed writes inside and outside the boundary.

Command: `npm --workspace=packages/sandbox run test`
