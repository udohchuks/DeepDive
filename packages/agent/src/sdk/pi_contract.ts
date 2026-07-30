import {
  createAgentSession as piCreateAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentSession as PiAgentSession,
  CreateAgentSessionOptions,
  CreateAgentSessionResult,
  ExtensionAPI,
  InlineExtension,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

/**
 * Adapter over the real pi coding-agent SDK.
 *
 * This file used to be a hand-written reimplementation of pi's types. It was
 * never checked against the published package, and it had drifted — most
 * dangerously on `noTools: 'builtin'`, which the stub treated as "drop custom
 * tools too" while real pi documents the opposite ("disable the default
 * built-in tools but keep extension/custom tools enabled"). Anything relying on
 * the stub's reading would have left custom tools live on a role meant to have
 * none, which is a P-2 failure.
 *
 * The lesson is encoded structurally rather than in a comment: every role
 * declares an explicit `tools` allowlist. Real pi documents the allowlist as
 * exact ("only the listed tool names are enabled"), so role scoping no longer
 * depends on interpreting `noTools` at all.
 */

/** Our own hook vocabulary, kept stable so role policy code is SDK-agnostic. */
export interface ToolCallHookContext {
  toolName: string;
  args: Record<string, unknown>;
  role: string;
}

export interface ToolCallHookResult {
  block?: boolean;
  reason?: string;
}

export type ToolCallHook = (
  context: ToolCallHookContext,
) => ToolCallHookResult | Promise<ToolCallHookResult>;

/** Built-in tool names pi ships, so allowlists can be checked against them. */
export const PI_BUILTIN_TOOLS = ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'] as const;

/**
 * Wraps a role policy hook as a pi inline extension.
 *
 * pi passes `event.input` by reference and performs no re-validation after a
 * handler mutates it, so the hook is handed the live object rather than a copy:
 * we must evaluate exactly what will execute, not a snapshot taken before some
 * other handler edited it.
 */
export function createRoleGateExtension(role: string, hook: ToolCallHook): InlineExtension {
  return {
    name: `deepdive-role-gate:${role}`,
    factory: (pi: ExtensionAPI) => {
      pi.on('tool_call', async (event: ToolCallEvent): Promise<ToolCallEventResult> => {
        try {
          const result = await hook({
            toolName: event.toolName,
            args: event.input as Record<string, unknown>,
            role,
          });
          return { block: result.block ?? false, reason: result.reason };
        } catch (err: unknown) {
          // Fail closed: an evaluator that crashed has not authorized anything.
          const message = err instanceof Error ? err.message : 'unknown error';
          return { block: true, reason: `Role gate evaluation failed: ${message}` };
        }
      });
    },
  };
}

export interface RoleSessionOptions {
  role: string;
  /** Exact allowlist. Required — roles never inherit pi's default tool set. */
  tools: string[];
  customTools?: ToolDefinition[];
  hook: ToolCallHook;
  cwd?: string;
  /** Injectable for tests so no test constructs a real model runtime. */
  createSession?: (options: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;
}

/**
 * Pure, offline-testable derivation of the pi options for a role.
 *
 * Split out from session construction so the security-relevant part — which
 * tools a role is granted — can be asserted without a model runtime, a network
 * call, or an API key.
 */
export function buildRoleSessionOptions(
  options: RoleSessionOptions,
): Omit<CreateAgentSessionOptions, 'resourceLoader' | 'sessionManager' | 'settingsManager'> {
  return {
    cwd: options.cwd ?? process.cwd(),
    tools: [...options.tools],
    customTools: options.customTools ?? [],
  };
}

/**
 * Creates a real pi AgentSession scoped to one role.
 *
 * Discovered extensions are disabled (`noExtensions`). Inline factories still
 * load, so our gate survives while project- and user-level extensions do not:
 * a third-party extension could otherwise register its own `tool_call` handler
 * and mutate tool input after our gate had already validated it.
 */
export async function createRoleSession(options: RoleSessionOptions): Promise<PiAgentSession> {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [createRoleGateExtension(options.role, options.hook)],
    noExtensions: true,
  });
  await resourceLoader.reload();

  const create = options.createSession ?? piCreateAgentSession;
  const { session } = await create({
    ...buildRoleSessionOptions(options),
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(),
  });

  return session;
}

export type { PiAgentSession as AgentSession, ToolDefinition };
