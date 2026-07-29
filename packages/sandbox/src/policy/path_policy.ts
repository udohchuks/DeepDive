import path from 'path';
import fs from 'fs';
import { MountPolicy } from '../types.js';

export class PathPolicyEvaluator {
  constructor(private policy: MountPolicy) {}

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
