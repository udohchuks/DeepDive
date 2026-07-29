import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  activateExtension,
  ProgressiveHintController,
  StrugglePromptController,
} from '../src/index.js';

describe('VS Code Extension Host & UI (Phase 8)', () => {
  it('activates extension and dispatches webview bridge messages', async () => {
    const subscriptions: { dispose(): void }[] = [];
    const { bridge, provider } = activateExtension({ subscriptions });

    expect(provider.getHtmlForWebview()).toContain('DeepDive Guided Project Studio');

    let receivedMsg = '';
    bridge.registerHandler((msg) => {
      receivedMsg = msg.type;
    });

    await bridge.dispatch({ type: 'submit_artifact', payload: { id: 'art-1' } });
    expect(receivedMsg).toBe('submit_artifact');

    await bridge.dispatch({ type: 'request_hint', payload: { level: 'L1' } });
    expect(receivedMsg).toBe('request_hint');

    await bridge.dispatch({ type: 'answer_clarification', payload: { q1: 'answer' } });
    expect(receivedMsg).toBe('answer_clarification');
  });

  it('Progressive hint reveal steps L1 -> L2 -> L3 -> L4 ceiling (cannot step past L4)', () => {
    expect(ProgressiveHintController.getNextLevel('L1')).toBe('L2');
    expect(ProgressiveHintController.getNextLevel('L2')).toBe('L3');
    expect(ProgressiveHintController.getNextLevel('L3')).toBe('L4');
    expect(ProgressiveHintController.getNextLevel('L4')).toBeNull(); // L4 ceiling
  });

  it('Struggle prompt modal triggers on 2 consecutive sticking field flags', () => {
    const notStruggling = StrugglePromptController.checkAndTriggerStrugglePrompt(['field_a', 'field_b']);
    expect(notStruggling.isVisible).toBe(false);

    const struggling = StrugglePromptController.checkAndTriggerStrugglePrompt(['field_a', 'field_a']);
    expect(struggling.isVisible).toBe(true);
    expect(struggling.fieldId).toBe('field_a');
    expect(struggling.options).toEqual(['request_hint', 'dismiss']);
  });

  it('PROTECTED INVARIANT P-2: UI code contains ZERO buttons, options, or handlers for solution generation', () => {
    const extensionCode = fs.readFileSync(path.join(process.cwd(), 'apps/vscode-extension/src/extension.ts'), 'utf-8');
    const bridgeCode = fs.readFileSync(path.join(process.cwd(), 'apps/vscode-extension/src/bridge.ts'), 'utf-8');
    const hintCode = fs.readFileSync(path.join(process.cwd(), 'apps/vscode-extension/src/ui/hint_panel.ts'), 'utf-8');
    const struggleCode = fs.readFileSync(path.join(process.cwd(), 'apps/vscode-extension/src/ui/struggle_modal.ts'), 'utf-8');

    const combined = extensionCode + bridgeCode + hintCode + struggleCode;

    expect(combined).not.toContain('generate_solution');
    expect(combined).not.toContain('write_solution');
    expect(combined).not.toContain('give_answer');
    expect(combined).not.toContain('show_solution');
  });
});
