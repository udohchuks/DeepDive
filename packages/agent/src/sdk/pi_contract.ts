import { Clock, IdGenerator, SystemClock, CryptoIdGenerator } from '@deepdive/core';

export interface ToolCallHookContext {
  toolName: string;
  args: Record<string, unknown>;
  role: string;
}

export interface ToolCallHookResult {
  block?: boolean;
  reason?: string;
}

export type ToolCallHook = (context: ToolCallHookContext) => ToolCallHookResult | Promise<ToolCallHookResult>;

export interface AgentSessionOptions {
  tools?: string[];
  excludeTools?: string[];
  noTools?: 'all' | 'builtin';
  customTools?: Record<string, unknown>;
  clock?: Clock;
  idGenerator?: IdGenerator;
  hooks?: {
    tool_call?: ToolCallHook;
  };
}

export interface AgentSession {
  sessionId: string;
  role: string;
  grantedTools: string[];
  options: AgentSessionOptions;
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ blocked: boolean; result?: unknown; reason?: string }>;
}

const ALL_BUILTIN_TOOLS = ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'];

export function createAgentSession(role: string, options: AgentSessionOptions): AgentSession {
  const clock = options.clock ?? new SystemClock();
  const idGen = options.idGenerator ?? new CryptoIdGenerator();

  let grantedTools: string[] = [];

  if (options.noTools === 'all') {
    grantedTools = options.customTools ? Object.keys(options.customTools) : [];
  } else if (options.noTools === 'builtin') {
    grantedTools = options.customTools ? Object.keys(options.customTools) : [];
  } else if (options.tools) {
    grantedTools = [...options.tools];
  } else {
    grantedTools = [...ALL_BUILTIN_TOOLS];
  }

  if (options.excludeTools) {
    grantedTools = grantedTools.filter((t) => !options.excludeTools!.includes(t));
  }

  if (options.customTools && options.noTools !== 'all' && options.noTools !== 'builtin') {
    for (const customName of Object.keys(options.customTools)) {
      if (!grantedTools.includes(customName)) {
        grantedTools.push(customName);
      }
    }
  }

  return {
    sessionId: `session-${role}-${idGen.generate()}-${clock.isoString()}`,
    role,
    grantedTools,
    options,
    executeTool: async (toolName: string, args: Record<string, unknown>) => {
      if (!grantedTools.includes(toolName)) {
        return {
          blocked: true,
          reason: `Tool "${toolName}" is not granted to role "${role}". Granted: [${grantedTools.join(', ')}]`,
        };
      }

      if (options.hooks?.tool_call) {
        try {
          const hookRes = await options.hooks.tool_call({ toolName, args, role });
          if (hookRes?.block) {
            return {
              blocked: true,
              reason: hookRes.reason ?? `tool_call hook blocked tool execution: ${toolName}`,
            };
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'unknown error';
          return {
            blocked: true,
            reason: `tool_call hook evaluation failed error: ${errMsg}`,
          };
        }
      }

      return {
        blocked: false,
        result: `Executed ${toolName}`,
      };
    },
  };
}
