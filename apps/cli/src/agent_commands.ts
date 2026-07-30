import path from 'path';
import {
  createRoleModel,
  createScaffolderSession,
  createVerifierSession,
  RoleModel,
} from '@deepdive/agent';
import { PathPolicyEvaluator, runPreflight } from '@deepdive/sandbox';
import { EnvironmentKeyStore, createModelProvider, MissingApiKeyError } from '@deepdive/provider';

export class SandboxUnavailableError extends Error {
  constructor(status: string, remediation?: string) {
    super(
      `Sandbox is not available on this machine (${status}). ` +
        `The Scaffolder and Verifier execute tools against a real workspace, so they do not run unsandboxed.\n` +
        (remediation ?? ''),
    );
    this.name = 'SandboxUnavailableError';
  }
}

/**
 * Resolves the provider id and pinned model the roles should use.
 *
 * The pinned model is read back off the configured provider rather than
 * hardcoded here, so the CLI and the Grader cannot drift onto different models.
 */
export function resolveRoleModelConfig(env: NodeJS.ProcessEnv = process.env): {
  providerId: string;
  modelId: string;
} {
  const requested = (env.MODEL_PROVIDER ?? 'anthropic').toLowerCase();
  const providerId = requested === 'claude' ? 'anthropic' : requested;
  const provider = createModelProvider(providerId) as { model?: string };
  return { providerId, modelId: provider.model ?? '' };
}

export async function buildRoleModel(env: NodeJS.ProcessEnv = process.env): Promise<RoleModel> {
  const { providerId, modelId } = resolveRoleModelConfig(env);
  const apiKey = new EnvironmentKeyStore().getApiKey(providerId);
  if (!apiKey) {
    throw new MissingApiKeyError(providerId);
  }
  return createRoleModel({ providerId, modelId, apiKey });
}

/**
 * Refuses to build a tool-using session when the sandbox is unavailable.
 *
 * This is the no-unsandboxed-fallback rule applied at the entry point rather
 * than deep in the stack, so the failure names the missing facility and how to
 * get it instead of surfacing later as a confusing tool error.
 */
export function assertSandboxAvailable(): void {
  const preflight = runPreflight();
  if (!preflight.isSupported) {
    throw new SandboxUnavailableError(preflight.status, preflight.remediationText);
  }
}

export interface AgentRunResult {
  lines: string[];
}

function workspacePolicy(workspace: string, gradedArtifactPaths: string[]): PathPolicyEvaluator {
  const root = path.resolve(workspace);
  return new PathPolicyEvaluator({
    readOnlyPaths: [root],
    readWritePaths: [root],
    blockedPaths: gradedArtifactPaths.map((p) => path.join(root, p)),
  });
}

export const DEFAULT_GRADED_ARTIFACTS = ['sdd.json', 'rsdd.json', 'cdd.json'];

/**
 * Runs the Scaffolder against a workspace.
 *
 * Graded artifacts are both blocked in the path policy and re-checked by the
 * P-2 hook: the Scaffolder may create tests and scaffolding, never the design
 * document the student is graded on.
 */
export async function runScaffold(
  workspace: string,
  instruction: string,
  model: RoleModel,
): Promise<AgentRunResult> {
  assertSandboxAvailable();

  const evaluator = workspacePolicy(workspace, DEFAULT_GRADED_ARTIFACTS);
  const session = await createScaffolderSession(
    evaluator,
    DEFAULT_GRADED_ARTIFACTS,
    model,
    path.resolve(workspace),
  );

  await session.prompt(instruction);

  return {
    lines: [
      `scaffolder: ${session.getActiveToolNames().join(', ')}`,
      `messages  : ${session.messages.length}`,
    ],
  };
}

/**
 * Runs the Verifier against a workspace. Read-only: it holds no write or edit
 * tool, and its hook rejects mutating bash commands.
 */
export async function runVerify(
  workspace: string,
  instruction: string,
  model: RoleModel,
): Promise<AgentRunResult> {
  assertSandboxAvailable();

  const session = await createVerifierSession(model, path.resolve(workspace));
  await session.prompt(instruction);

  return {
    lines: [
      `verifier  : ${session.getActiveToolNames().join(', ')}`,
      `messages  : ${session.messages.length}`,
    ],
  };
}
