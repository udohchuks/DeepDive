import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import {
  buildInteractiveSessionOptions,
  launchInteractiveRoleSession,
} from '../src/sdk/interactive.js';
import { buildScaffolderSessionOptions, SCAFFOLDER_TOOLS } from '../src/roles/scaffolder.js';
import { buildVerifierSessionOptions, VERIFIER_TOOLS } from '../src/roles/verifier.js';
import { PathPolicyEvaluator } from '@deepdive/policy';
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent';
import type { RoleModel } from '../src/sdk/role_model.js';

function tempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-interactive-'));
  return dir;
}

/** Stand-in model: a plain object shaped like a pi Model, plus a fake runtime. */
function fakeRoleModel(): RoleModel {
  return {
    // Cast through unknown: the real Model comes from pi-ai and is opaque here;
    // the options builder only ever passes it through.
    model: { id: 'test-model', provider: 'test' } as unknown as RoleModel['model'],
    // Only the surface services touches; creating a real ModelRuntime takes
    // ~7s to load the model registry, which no unit test should pay for.
    runtime: {
      refresh: async () => {},
      registerNativeProvider: () => {},
      registerProvider: () => {},
      getModels: () => [],
    } as unknown as RoleModel['runtime'],
  };
}

describe('buildInteractiveSessionOptions', () => {
  const evaluator = new PathPolicyEvaluator({
    readOnlyPaths: [],
    readWritePaths: ['/workspace/project'],
    blockedPaths: [],
  });
  const scaffolder = buildScaffolderSessionOptions(evaluator, ['sdd.json'], undefined, '/workspace/project');

  it('carries the exact role tool allowlist', () => {
    const options = buildInteractiveSessionOptions({ roleOptions: scaffolder, instruction: '' });
    expect(options.tools).toEqual([...SCAFFOLDER_TOOLS]);
  });

  it('omits model fields when no model is provided', () => {
    const options = buildInteractiveSessionOptions({ roleOptions: scaffolder, instruction: '' });
    expect(options.model).toBeUndefined();
    expect(options.scopedModels).toBeUndefined();
  });

  it('pins both the session model and the TUI model picker (D-5)', () => {
    const model = fakeRoleModel();
    const options = buildInteractiveSessionOptions({ roleOptions: scaffolder, instruction: '', model });
    expect(options.model).toBe(model.model);
    // scopedModels must contain exactly the role's model, so Ctrl+P cycling in
    // the TUI cannot drift a session onto a different model.
    expect(options.scopedModels).toEqual([{ model: model.model }]);
  });
});

describe('launchInteractiveRoleSession', () => {
  // A real ModelRuntime.create takes ~7s to load the model registry, which
  // alone would exceed vitest's timeout; the fake runtime is only stored, and
  // the session manager is in-memory so no session files are written.
  const model = fakeRoleModel();
  const sessionManager = SessionManager.inMemory();

  it('drives the injected TUI with a role-scoped session', async () => {
    const workspace = tempWorkspace();
    const evaluator = new PathPolicyEvaluator({
      readOnlyPaths: [workspace],
      readWritePaths: [workspace],
      blockedPaths: [path.join(workspace, 'sdd.json')],
    });

    const seen: { runtime: AgentSessionRuntime; instruction: string }[] = [];
    const { session } = await launchInteractiveRoleSession({
      roleOptions: buildScaffolderSessionOptions(evaluator, ['sdd.json'], undefined, workspace),
      instruction: 'write failing tests',
      model,
      sessionManager,
      tuiFactory: (runtime, instruction) => {
        seen.push({ runtime, instruction });
        return {
          init: async () => {},
          run: async () => {},
        };
      },
    });

    // The TUI received the instruction as its initial message.
    expect(seen[0]?.instruction).toBe('write failing tests');

    // And the session it would drive is the scaffolder's, not pi's default
    // tool set: the allowlist survived interactive session creation.
    expect(session.getActiveToolNames().sort()).toEqual([...SCAFFOLDER_TOOLS].sort());

    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('scopes the verifier to read-only tools in the TUI too', async () => {
    const { session } = await launchInteractiveRoleSession({
      roleOptions: { ...buildVerifierSessionOptions(), cwd: tempWorkspace() },
      instruction: '',
      model,
      sessionManager,
      tuiFactory: (runtime) => {
        void runtime;
        return { init: async () => {}, run: async () => {} };
      },
    });

    expect(session.getActiveToolNames().sort()).toEqual([...VERIFIER_TOOLS].sort());
  });
});
