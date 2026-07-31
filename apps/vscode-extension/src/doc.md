# VS Code Extension

**App:** deepdive (`apps/vscode-extension`)  ·  **Build step:** 8.1, 8.2  ·  **Architecture ref:** §10

## What it does
A loadable VS Code extension whose primary surface is an interactive side panel (`deepdive.interactiveView`): a form per phase, submitted for grading in place, with each rejection shown under the field that caused it, the hint ladder inline, and phase progress and streaks in a header card. Also grades the open artifact from the editor and publishes findings as diagnostics, and keeps a secondary tree view for raw round history.

The forms are the point. The old flow required knowing that a charter wants `scopeBounds` and not `scope`, and punished a wrong guess with a rejected round — a rejection that taught nothing about the student's thinking, only about key names. The shape of an artifact is not what is being assessed, so making it visible costs nothing and removes that whole class of failure.

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
- **The UI cannot ask the AI to do the work (P-2).** No control generates a graded artifact, no help text carries an example answer, and a revealed hint can never reach the form values — it renders as prose in its own section. A test asserts each of these, because a form is precisely the surface where the invariant would be easiest to break quietly.
- **The panel writes the artifact file and grades the file, not the form values.** The artifact is the thing on record; a round graded from memory could not be re-read later, and the editor and the panel would disagree about what was submitted. The file also stays the source of truth on load, so hand-editing `charter.json` and reopening the panel shows what is on disk.
- **Every phase stays selectable.** Locking phases until the previous one is approved would mean the tool decides what you work on next, and the order of your own work is the part that belongs to the student.
- **Findings are placed two ways.** A deterministic finding quotes its field in the message; a judged one carries a criterion id and prose, so the schema's `criteria` map places it. The quoted token is only honoured when it names a field this form actually has — the Grader quotes the student's own words back at them, and an unchecked match put a rejection about the goal under whichever word happened to be in quotes. Anything still unplaced renders as a banner rather than being dropped.
- **The webview holds no state.** It is redrawn from `PanelState` after every action and posts the current field values back with each message. A second copy living in the webview's script would be a second version of the truth that could disagree with the round history.
- **`scaffold` and `verify` are deliberately not commands here.** They hold tools and write files, and their protection is a per-command approval prompt. Behind a one-click button in a panel, running an agent becomes a reflex rather than a decision. They stay at the command line. A test asserts the manifest declares no such command, so adding one is a deliberate act rather than an oversight.
- **The ladder's ceiling is structural in the view too:** at L4 the template renders no button, so there is no control that could ask for a fifth level. Every revealed rung stays on screen, because re-reading one is free and a rung that vanished would push the student to ask for the next just to see something.
- **The finding→field mapping is a heuristic.** Findings carry a criterion id, not a JSON path, so the field is read from the quoted name in the message (`"scopeBounds" must be …`). When it finds nothing the diagnostic still appears, on the whole document — a finding that vanished because its field could not be located would be worse than one placed imprecisely. The principled fix is for code checks to report the field alongside the message.
- **The manifest name is `deepdive`, not `@deepdive/vscode-extension`.** VS Code rejects a scoped name. Nothing imports this app by name, so the npm identity was the one to give up.
- **Bundled to CJS** (`dist/extension.cjs`) with `vscode` external. The package is `"type": "module"`, so the `.cjs` extension is what makes the format explicit.
- **Dirty editors are saved before grading.** Grading the file on disk while the editor holds unsaved changes would judge work the student cannot see, and record it as a round.

## Tests
Covered by `apps/vscode-extension/tests/extension.test.ts`.

Command: `npm --workspace=apps/vscode-extension run test`
