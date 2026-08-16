import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentSession,
  AgentSessionRuntime,
  CreateAgentSessionRuntimeFactory,
  SessionManager as PiSessionManager,
} from '@earendil-works/pi-coding-agent';
import type { RoleModel } from './role_model.js';
import { createRoleGateExtension, RoleSessionOptions } from './pi_contract.js';

/**
 * Runs a role session inside pi's own interactive TUI (the `pi` app's UI),
 * with DeepDive's role policy enforced on every tool call.
 *
 * The TUI is chat-shaped, which P-3 permits as long as the AI turns stay
 * constrained — here the constraint is not prompt-deep but structural: the
 * session the TUI drives is created by *our* runtime factory, so the tool
 * allowlist, the role gate, and the pinned model apply to every session the
 * TUI can ever create, including `/new` and forks.
 *
 * Approval differs from the headless path deliberately: the TUI owns the
 * terminal, so our readline `y/N` approver cannot run. Policy denials are the
 * enforcement — blocked calls are shown inline by the TUI with the policy
 * reason — which is `--auto` semantics for what policy permits, and a hard
 * wall for what it does not (P-2 artifacts, workspace boundary).
 */

/** Minimal surface of InteractiveMode the launcher needs; injectable for tests. */
export interface TuiMode {
  init(): Promise<void>;
  run(): Promise<void>;
}

export type TuiModeFactory = (runtime: AgentSessionRuntime, instruction: string) => TuiMode;

const defaultTuiFactory: TuiModeFactory = (runtime, instruction) =>
  new InteractiveMode(runtime, instruction ? { initialMessage: instruction } : {});

/**
 * Pure derivation of the session options the interactive factory uses.
 *
 * Split out, like buildRoleSessionOptions, so the security-relevant wiring —
 * exact tools, pinned model — can be asserted without a TTY, a model runtime,
 * or a network call.
 */
export function buildInteractiveSessionOptions(
  options: InteractiveLaunchOptions,
): {
  tools: string[];
  customTools: RoleSessionOptions['customTools'];
  model?: RoleModel['model'];
  scopedModels?: { model: RoleModel['model'] }[];
} {
  // From the role options directly (not the pi-options Omit type), because a
  // role's tool list is required by our own RoleSessionOptions.
  const base = {
    tools: [...options.roleOptions.tools],
    customTools: options.roleOptions.customTools ?? [],
  };

  if (!options.model) {
    return base;
  }

  // scopedModels pins the TUI's model picker (Ctrl+P) to exactly the role's
  // model. Without it a student could cycle mid-session onto a different
  // model, and the same submission would be scaffolded by two different
  // models depending on when it ran (D-5).
  return {
    ...base,
    model: options.model.model,
    scopedModels: [{ model: options.model.model }],
  };
}

export interface InteractiveLaunchOptions {
  /** Role definition: exact tool allowlist, policy hook, working directory. */
  roleOptions: RoleSessionOptions;
  /** Model the role is pinned to; resolved by the CLI composition root. */
  model?: RoleModel;
  /** Sent as the TUI's initial message; may be empty to just open the TUI. */
  instruction: string;
  /** Injectable for tests; defaults to pi's InteractiveMode. */
  tuiFactory?: TuiModeFactory;
  /** Injectable for tests so no session files are written. */
  sessionManager?: PiSessionManager;
}

export interface InteractiveLaunchResult {
  /** The session the TUI drove, for audit and round recording after exit. */
  session: AgentSession;
  runtime: AgentSessionRuntime;
}

export async function launchInteractiveRoleSession(
  options: InteractiveLaunchOptions,
): Promise<InteractiveLaunchResult> {
  const cwd = options.roleOptions.cwd ?? process.cwd();
  const agentDir = getAgentDir();
  const sessionManager = options.sessionManager ?? SessionManager.create(cwd);

  // Built once, reused by every session the factory creates. Without an
  // explicit runtime, services constructs its own that may refresh the model
  // catalog over the network — the same hang and the same D-5 determinism
  // leak createRoleModel guards the headless path against. A role's model list
  // must not change between one session and the next.
  const modelRuntime =
    options.model?.runtime ?? (await ModelRuntime.create({ allowModelNetwork: false }));

  // The factory is stored on the runtime and reused for every session the TUI
  // creates later (/new, fork, resume). Building it here means role scoping
  // survives session switching rather than applying only to the first session.
  const factory: CreateAgentSessionRuntimeFactory = async ({ cwd, agentDir, sessionManager }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      modelRuntime,
      resourceLoaderOptions: {
        // Same posture as createRoleSession: our inline gate loads, discovered
        // third-party extensions do not — one could otherwise register its own
        // tool_call handler and mutate input after our gate validated it.
        extensionFactories: [createRoleGateExtension(options.roleOptions.role, options.roleOptions.hook)],
        noExtensions: true,
      },
    });

    const result = await createAgentSessionFromServices({
      services,
      sessionManager,
      ...buildInteractiveSessionOptions(options),
    });

    return { ...result, services, diagnostics: [] };
  };

  const runtime = await createAgentSessionRuntime(factory, { cwd, agentDir, sessionManager });

  const tui = (options.tuiFactory ?? defaultTuiFactory)(runtime, options.instruction);
  await tui.init();
  await tui.run();

  return { session: runtime.session, runtime };
}
