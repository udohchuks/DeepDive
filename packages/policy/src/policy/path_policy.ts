import path from 'path';
import fs from 'fs';
/**
 * Which paths a role may read and write.
 *
 * Previously named MountPolicy and defined alongside the sandbox wrappers,
 * because it described bind mounts. It now describes only in-process access
 * checks, so it is named for what it actually is.
 */
export interface PathPolicy {
  readOnlyPaths: string[];
  readWritePaths: string[];
  blockedPaths: string[];
}

/**
 * Whether `child` is `parent` itself or lives underneath it.
 *
 * Both sides are resolved first, so a relative path is answered against the
 * current directory rather than compared as text. Substring matching — the
 * obvious shortcut — is wrong in both directions: `/repo/graded-old` contains
 * `/repo/graded` without being inside it, and a relative `charter.json` does
 * not contain the absolute graded path even when it resolves into it.
 */
export function isPathWithin(parent: string, child: string): boolean {
  const from = path.resolve(parent);
  const to = path.resolve(child);
  if (from === to) return true;
  const relative = path.relative(from, to);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export class PathPolicyEvaluator {
  constructor(private policy: PathPolicy) {}

  /** Canonicalizes path, resolving relative components and symlinks if existing */
  public canonicalize(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    try {
      if (fs.existsSync(resolved)) {
        return fs.realpathSync(resolved);
      }
    } catch {
      // If file doesn't exist yet (e.g. new file creation), canonicalize parent directory
      const parent = path.dirname(resolved);
      if (fs.existsSync(parent)) {
        const realParent = fs.realpathSync(parent);
        return path.join(realParent, path.basename(resolved));
      }
    }
    return resolved;
  }

  private isSubpath(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  public evaluateWriteAccess(targetPath: string): { allowed: boolean; reason?: string } {
    const canonicalTarget = this.canonicalize(targetPath);

    // Check blocklist first
    for (const blocked of this.policy.blockedPaths) {
      const canonicalBlocked = this.canonicalize(blocked);
      if (this.isSubpath(canonicalBlocked, canonicalTarget) || canonicalTarget === canonicalBlocked) {
        return { allowed: false, reason: `Path is explicitly blocked: ${targetPath}` };
      }
    }

    // Check read-write allowlist
    for (const rwPath of this.policy.readWritePaths) {
      const canonicalRw = this.canonicalize(rwPath);
      if (this.isSubpath(canonicalRw, canonicalTarget) || canonicalTarget === canonicalRw) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `Path is outside authorized write boundaries: ${targetPath}` };
  }

  public evaluateReadAccess(targetPath: string): { allowed: boolean; reason?: string } {
    const canonicalTarget = this.canonicalize(targetPath);

    for (const blocked of this.policy.blockedPaths) {
      const canonicalBlocked = this.canonicalize(blocked);
      if (this.isSubpath(canonicalBlocked, canonicalTarget) || canonicalTarget === canonicalBlocked) {
        return { allowed: false, reason: `Path is explicitly blocked: ${targetPath}` };
      }
    }

    // Read allowed if in readOnly or readWrite paths
    const allowedPaths = [...this.policy.readOnlyPaths, ...this.policy.readWritePaths];
    for (const allowedPath of allowedPaths) {
      const canonicalAllowed = this.canonicalize(allowedPath);
      if (this.isSubpath(canonicalAllowed, canonicalTarget) || canonicalTarget === canonicalAllowed) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `Path is outside authorized read boundaries: ${targetPath}` };
  }
}
