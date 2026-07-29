# VS Code Extension Host & Webview UI Bridge

**App:** @deepdive/vscode-extension  ·  **Build step:** 8.1, 8.2  ·  **Architecture ref:** §10

## What it does
Provides the VS Code Extension entrypoint, Webview panel rendering, postMessage communication bridge (`submit_artifact`, `request_hint`, `answer_clarification`), progressive hint reveal panel (L1–L4 ceiling), and proactive struggle prompt modal.

## How it works
1. **Message Bridge (Step 8.1):** `ExtensionMessageBridge` dispatches postMessage events between VS Code Extension Host and Webview panel.
2. **Progressive Hint Reveal (Step 8.2):** `ProgressiveHintController` steps through L1 -> L2 -> L3 -> L4. Requests past L4 return `null`, enforcing the hard procedural nudge ceiling.
3. **Proactive Struggle Prompt (Step 8.2):** `StrugglePromptController` checks if the same primary sticking field recurs across 2 consecutive resubmissions, prompting the student to request an L1 hint or dismiss.
4. **P-2 Protected Invariant:** The UI contains **zero buttons, options, or handlers for solution code generation**.

## How to use it
```typescript
import { activateExtension, ProgressiveHintController } from '@deepdive/vscode-extension';

const { bridge, provider } = activateExtension({ subscriptions: [] });
const nextLevel = ProgressiveHintController.getNextLevel('L2'); // 'L3'
```

## Constraints & gotchas
- Extension UI must never provide a button or prompt option that generates solution code for the student.

## Tests
Covered by `apps/vscode-extension/tests/extension.test.ts`.

Command: `npm --workspace=apps/vscode-extension run test`
