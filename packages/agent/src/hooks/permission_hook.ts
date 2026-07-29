import { PathPolicyEvaluator, classifyCommand } from '@deepdive/sandbox';
import { ToolCallHookContext, ToolCallHookResult } from '../sdk/pi_contract.js';

export interface PermissionHookOptions {
  role: 'scaffolder' | 'verifier' | 'grader';
  pathEvaluator?: PathPolicyEvaluator;
  gradedArtifactPaths?: string[];
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

          // P-2 check: Scaffolder cannot write into a graded-artifact path
          if (options.gradedArtifactPaths) {
            for (const gradedPath of options.gradedArtifactPaths) {
              if (targetPath.includes(gradedPath)) {
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
