# VS Code Extension

**App:** deepdive (`apps/vscode-extension`)  ·  **Build step:** 8.1, 8.2  ·  **Architecture ref:** §10

## What it does
A loadable VS Code extension: grades the open artifact and shows each rejection as a diagnostic on the line that caused it, keeps a sidebar with phase progress, consistency stats and round history, puts the current phase in the status bar, and renders the L1–L4 hint ladder in a panel. It was previously a stub — no manifest, no `vscode` import — and could not be loaded by an editor.

## How it works
1. **The CLI is the engine (process boundary):** every command shells out to `deepdive … --json` rather than importing the packages. Two reasons. The commands that matter open SQLite through `better-sqlite3`, a native module built for Node's ABI rather than the Electron ABI the extension host runs, or drive a model through the pi harness; both are happier in their own process. The second reason would still apply without the first — one implementation of "what does grading a charter mean" is easier to keep honest than two.
2. **`--json`, never the printed lines:** the human output is written to be read and is free to change wording. Parsing it would make every rephrasing a breaking change, so the CLI emits a structured result and the extension reads that. The printed lines still come along inside it, for the output channel.
3. **Findings become diagnostics:** `findingsToDiagnostics` maps a round's findings onto character spans in the artifact source, so a rejection appears as a squiggle in the Problems panel instead of scrolling past in a log. This is the thing the editor does that a terminal cannot.
4. **One file imports `vscode`:** `activation.ts`. Everything with a decision in it — which rubric a file belongs to, where to underline, what the tree holds — lives in a plain module and is tested without an editor.

## How to use it
```bash
npm run build                   # tsc -b, then esbuild bundles dist/extension.cjs
```
Then press **F5** (`.vscode/launch.json` → *Run DeepDive Extension*), or point `deepdive.cliPath` at `apps/cli/dist/bin.js` in an installed copy.

## Constraints & gotchas
- **The UI cannot ask the AI to do the work (P-2).** No control generates a graded artifact, and the webview's only message type asks for the next hint rung.
- **`scaffold` and `verify` are deliberately not commands here.** They hold tools and write files, and their protection is a per-command approval prompt. Behind a one-click button in a panel, running an agent becomes a reflex rather than a decision. They stay at the command line. A test asserts the manifest declares no such command, so adding one is a deliberate act rather than an oversight.
- **The ladder's ceiling is structural in the view too:** at L4 the template renders no button, so there is no control that could ask for a fifth level. Every revealed rung stays on screen, because re-reading one is free and a rung that vanished would push the student to ask for the next just to see something.
- **The finding→field mapping is a heuristic.** Findings carry a criterion id, not a JSON path, so the field is read from the quoted name in the message (`"scopeBounds" must be …`). When it finds nothing the diagnostic still appears, on the whole document — a finding that vanished because its field could not be located would be worse than one placed imprecisely. The principled fix is for code checks to report the field alongside the message.
- **The manifest name is `deepdive`, not `@deepdive/vscode-extension`.** VS Code rejects a scoped name. Nothing imports this app by name, so the npm identity was the one to give up.
- **Bundled to CJS** (`dist/extension.cjs`) with `vscode` external. The package is `"type": "module"`, so the `.cjs` extension is what makes the format explicit.
- **Dirty editors are saved before grading.** Grading the file on disk while the editor holds unsaved changes would judge work the student cannot see, and record it as a round.

## Tests
Covered by `apps/vscode-extension/tests/extension.test.ts`.

Command: `npm --workspace=apps/vscode-extension run test`
