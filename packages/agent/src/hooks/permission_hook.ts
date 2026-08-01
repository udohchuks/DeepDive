import path from 'path';
import { PathPolicyEvaluator, classifyCommand, isPathWithin } from '@deepdive/policy';
import { ToolCallHookContext, ToolCallHookResult } from '../sdk/pi_contract.js';

export interface PermissionHookOptions {
  role: 'scaffolder' | 'verifier' | 'grader';
  pathEvaluator?: PathPolicyEvaluator;
  gradedArtifactPaths?: string[];
}

/**
 * Whether a write target is a graded artifact.
 *
 * Entries come in two shapes and mean different things. A bare filename
 * (`sdd.json`) means "the graded artifact, wherever the student keeps it", so
 * it matches on basename anywhere. An entry containing a separator names a
 * location, so it matches by resolved containment.
 *
 * Both used to be answered with `targetPath.includes(gradedPath)`, which is
 * wrong in both directions: `/repo/graded-old/x` "contains" `/repo/graded`
 * without being inside it, and a relative target does not textually contain an
 * absolute graded path even when it resolves into one. Under-matching here
 * means the Scaffolder writes the artifact the student is graded on, which is
 * the one thing P-2 exists to prevent, so the comparison has to be by path
 * structure rather than by substring.
 */
export function isGradedArtifact(gradedPath: string, targetPath: string): boolean {
  if (!targetPath) return false;

  const isBareName = !/[/\\]/.test(gradedPath);
  if (isBareName) {
    return path.basename(targetPath).toLowerCase() === gradedPath.toLowerCase();
  }

  return isPathWithin(gradedPath, targetPath);
}

export function createPermissionHook(options: PermissionHookOptions) {
  return async (context: ToolCallHookContext): Promise<ToolCallHookResult> => {
    try {
      const { toolName, args } = context;

      // 1. Grader physically cannot run filesystem/bash tools
      if (options.role === 'grader') {
        if (['write', 'edit', 'bash', 'read', 'grep', 'find', 'ls'].includes(toolName)) {
          return {
            block: true,
            reason: `Grader role is forbidden from using filesystem/bash tools: ${toolName}`,
          };
        }
      }

      // 2. Verifier is read-only
      if (options.role === 'verifier') {
        if (['write', 'edit'].includes(toolName)) {
          return {
            block: true,
            reason: `Verifier role is read-only and cannot use mutating tool: ${toolName}`,
          };
        }
        if (toolName === 'bash') {
          const commandStr = (args.command as string) ?? '';
          const classification = classifyCommand(commandStr);
          if (!classification.isReadOnly) {
            return {
              block: true,
              reason: `Verifier role blocked from executing mutating bash command: "${commandStr}"`,
            };
          }
        }
      }

      // 3. Scaffolder write-scope check & P-2 Graded Artifact Protection
      if (options.role === 'scaffolder') {
        if (['write', 'edit'].includes(toolName)) {
          const targetPath = (args.path as string) ?? (args.filePath as string) ?? '';

          // P-2 check: Scaffolder cannot write a graded artifact.
          if (options.gradedArtifactPaths) {
            for (const gradedPath of options.gradedArtifactPaths) {
              if (isGradedArtifact(gradedPath, targetPath)) {
                return {
                  block: true,
                  reason: `PROTECTED INVARIANT P-2: Scaffolder is forbidden from writing into graded-artifact path: ${targetPath}`,
                };
              }
            }
          }

          if (options.pathEvaluator) {
            const check = options.pathEvaluator.evaluateWriteAccess(targetPath);
            if (!check.allowed) {
              return {
                block: true,
                reason: check.reason ?? `Write access denied for path: ${targetPath}`,
              };
            }
          }
        }
      }

      return { block: false };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      return {
        block: true,
        reason: `Permission hook evaluator error: ${errMsg}`,
      };
    }
  };
}
