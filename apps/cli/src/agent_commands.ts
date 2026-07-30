import path from 'path';
import {
  createRoleModel,
  createScaffolderSession,
  createVerifierSession,
  resolveProviderCredential,
  ApprovalOptions,
  RoleModel,
} from '@deepdive/agent';
import { PathPolicyEvaluator } from '@deepdive/policy';
import { createModelProvider, KeyStore, MissingApiKeyError } from '@deepdive/provider';

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

/**
 * Resolves auth once, for every role, through pi's credential store.
 *
 * The CLI is the composition root, so it is the one place that both has pi
 * available and knows which provider is configured. Resolving here means a
 * student who has run `pi login` needs no .env at all, while the Grader — which
 * deliberately has no pi-coding-agent dependency — still receives the same
 * credential rather than resolving its own.
 */
export async function buildRoleModel(env: NodeJS.ProcessEnv = process.env): Promise<RoleModel> {
  const { providerId, modelId } = resolveRoleModelConfig(env);
  const credential = resolveProviderCredential(providerId, env);

  if (credential.source === 'none') {
    throw new MissingApiKeyError(providerId);
  }

  // An OAuth login has no API key to hand over; pi's own runtime resolves and
  // refreshes the token, so we pass no key and let it do that.
  return createRoleModel({ providerId, modelId, apiKey: credential.apiKey });
}

/**
 * KeyStore backed by the same pi-aware resolution the roles use, so the Grader
 * and the agent roles can never end up authenticating differently.
 */
export class PiBackedKeyStore implements KeyStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  getApiKey(providerName = 'anthropic'): string | null {
    return resolveProviderCredential(providerName, this.env).apiKey ?? null;
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
  approval: ApprovalOptions,
): Promise<AgentRunResult> {
  const evaluator = workspacePolicy(workspace, DEFAULT_GRADED_ARTIFACTS);
  const session = await createScaffolderSession(
    evaluator,
    DEFAULT_GRADED_ARTIFACTS,
    model,
    path.resolve(workspace),
    approval,
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
  approval: ApprovalOptions,
): Promise<AgentRunResult> {
  const session = await createVerifierSession(model, path.resolve(workspace), approval);
  await session.prompt(instruction);

  return {
    lines: [
      `verifier  : ${session.getActiveToolNames().join(', ')}`,
      `messages  : ${session.messages.length}`,
    ],
  };
}
