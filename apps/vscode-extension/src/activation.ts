import * as path from 'path';
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import {
  CliResult,
  DeepDiveClient,
  ProcessOutput,
  RoundSummary,
  StudioStats,
} from './deepdive_client.js';
import { findingsToDiagnostics, rubricForFile } from './diagnostics.js';
import { buildTree, statusBarText, TreeNode } from './tree_model.js';
import { renderHintHtml } from './hint_view.js';

/**
 * The only module that imports `vscode`.
 *
 * Everything with a decision in it — which rubric a file belongs to, where a
 * finding should be underlined, what the sidebar contains — lives in a plain
 * module beside this one and is tested without an editor. This file is the
 * adapter: it moves data between those functions and the VS Code API, and
 * holds as little judgement as it can.
 */

interface ExtensionState {
  client: DeepDiveClient;
  diagnostics: vscode.DiagnosticCollection;
  tree: DeepDiveTreeProvider;
  status: vscode.StatusBarItem;
  output: vscode.OutputChannel;
}

/** The project directory: the setting if set, else the open workspace folder. */
function projectDir(): string | null {
  const configured = vscode.workspace.getConfiguration('deepdive').get<string>('projectDir');
  if (configured && configured.trim().length > 0) return configured;

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

/**
 * Runs the CLI.
 *
 * `shell: false` throughout: workspace paths arrive here as arguments, and a
 * shell would give a path containing a quote or an ampersand a second meaning.
 * A `.js` path is run with the extension host's own Node rather than executed,
 * because the `node_modules/.bin` wrapper is a shell script on Windows.
 */
function createRunner(): (args: string[]) => Promise<ProcessOutput> {
  return (args) =>
    new Promise((resolve, reject) => {
      const configured = vscode.workspace.getConfiguration('deepdive').get<string>('cliPath');
      const cli = configured && configured.trim().length > 0 ? configured : 'deepdive';
      const isScript = /\.(c|m)?js$/.test(cli);

      const file = isScript ? process.execPath : cli;
      const argv = isScript ? [cli, ...args] : args;

      execFile(file, argv, { shell: false, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        // A non-zero exit is a result, not a failure: `grade` exits 1 for a
        // submission that needs revision. Only a failure to launch is fatal,
        // and that is the case where `error.code` is a string like ENOENT.
        if (error && typeof (error as NodeJS.ErrnoException).code === 'string') {
          reject(new Error(`Could not run "${cli}": ${(error as NodeJS.ErrnoException).code}`));
          return;
        }

        resolve({
          stdout,
          stderr,
          code: error && typeof error.code === 'number' ? error.code : 0,
        });
      });
    });
}

class DeepDiveTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private nodes: TreeNode[] = [];

  refreshWith(stats: StudioStats | undefined, rounds: readonly RoundSummary[]): void {
    this.nodes = buildTree(stats, rounds);
    this.changed.fire(undefined);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    return element ? (element.children ?? []) : this.nodes;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const expandable = (node.children?.length ?? 0) > 0;
    const item = new vscode.TreeItem(
      node.label,
      expandable
        ? node.kind === 'section'
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    item.id = node.id;
    item.description = node.description;
    if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
    // A finding's reason is usually longer than the tree column. Truncating a
    // rejection's explanation at the panel edge would undo the point of it.
    if (node.description) item.tooltip = `${node.label}\n\n${node.description}`;

    return item;
  }
}

/** Refreshes the sidebar and status bar from one studio call. */
async function refresh(state: ExtensionState): Promise<void> {
  const dir = projectDir();
  if (!dir) return;

  try {
    const result = await state.client.studio(dir);
    state.tree.refreshWith(result.stats, result.rounds ?? []);
    state.status.text = statusBarText(result.stats);
  } catch {
    // A directory with no DeepDive history is the ordinary state of a fresh
    // project, not an error worth a popup. The empty tree says so instead.
    state.tree.refreshWith(undefined, []);
    state.status.text = statusBarText(undefined);
  }
  state.status.show();
}

/** Publishes a round's findings onto the artifact that produced them. */
function publishDiagnostics(
  state: ExtensionState,
  document: vscode.TextDocument,
  result: CliResult,
): void {
  const specs = findingsToDiagnostics(result.findings ?? [], document.getText());

  state.diagnostics.set(
    document.uri,
    specs.map((spec) => {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(document.positionAt(spec.start), document.positionAt(spec.end)),
        spec.message,
        spec.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : spec.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
      );
      diagnostic.code = spec.code;
      diagnostic.source = 'deepdive';
      return diagnostic;
    }),
  );
}

const RUBRICS = ['charter', 'sdd', 'repo-charter', 'rsdd', 'plan', 'cdd'];

async function gradeCurrentFile(state: ExtensionState): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open the artifact you want graded first.');
    return;
  }

  const dir = projectDir();
  if (!dir) {
    vscode.window.showWarningMessage('Open a folder — DeepDive records history beside your project.');
    return;
  }

  const rubric =
    rubricForFile(editor.document.fileName) ??
    (await vscode.window.showQuickPick(RUBRICS, {
      title: `Which rubric grades ${path.basename(editor.document.fileName)}?`,
    }));
  if (!rubric) return;

  // Saved first: grading the file on disk while the editor holds unsaved
  // changes would judge work the student cannot see, and record it as a round.
  if (editor.document.isDirty) await editor.document.save();

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `DeepDive: grading ${rubric}…` },
    async () => {
      try {
        const result = await state.client.grade(rubric, editor.document.fileName, dir);
        state.output.appendLine(result.lines.join('\n'));
        publishDiagnostics(state, editor.document, result);

        if (result.status === 'approved') {
          vscode.window.showInformationMessage(`DeepDive: ${rubric} approved.`);
        } else {
          const count = result.findings?.length ?? 0;
          const choice = await vscode.window.showWarningMessage(
            `DeepDive: ${rubric} needs revision (${count} finding${count === 1 ? '' : 's'}).`,
            'Show hint',
            'Show output',
          );
          if (choice === 'Show hint') await vscode.commands.executeCommand('deepdive.hint');
          if (choice === 'Show output') state.output.show();
        }
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        await refresh(state);
      }
    },
  );
}

let hintPanel: vscode.WebviewPanel | undefined;

async function showHint(state: ExtensionState, level?: string): Promise<void> {
  const dir = projectDir();
  if (!dir) return;

  let result: CliResult;
  try {
    result = await state.client.hint(dir, level);
  } catch (err) {
    vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    return;
  }

  if (result.exitCode !== 0 && !result.content) {
    vscode.window.showInformationMessage(
      result.errors[0] ?? 'Nothing to hint at yet — submit something first.',
    );
    return;
  }

  // A freshly generated rung is not in `revealed`, which was read before the
  // reveal; appending it keeps every rung on screen after the first render.
  const revealed = [
    ...(result.revealed ?? []),
    ...(result.freshlyGenerated && result.level && result.content
      ? [{ level: result.level, content: result.content }]
      : []),
  ];

  if (!hintPanel) {
    hintPanel = vscode.window.createWebviewPanel(
      'deepdiveHints',
      'DeepDive Hints',
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );
    hintPanel.onDidDispose(() => {
      hintPanel = undefined;
    });
    hintPanel.webview.onDidReceiveMessage((message: { type?: string; payload?: { level?: string } }) => {
      // The webview can ask for the next rung and nothing else. There is no
      // message type here that produces graded work on the student's behalf.
      if (message.type === 'request_hint') void showHint(state, message.payload?.level);
    });
  }

  hintPanel.webview.html = renderHintHtml({
    targetFieldId: result.targetFieldId ?? 'this submission',
    roundNumber: typeof result.roundNumber === 'number' ? result.roundNumber : undefined,
    phaseId: result.phaseId,
    revealed,
  });
  hintPanel.reveal(vscode.ViewColumn.Beside, true);
}

export function activate(context: vscode.ExtensionContext): void {
  const state: ExtensionState = {
    client: new DeepDiveClient(createRunner()),
    diagnostics: vscode.languages.createDiagnosticCollection('deepdive'),
    tree: new DeepDiveTreeProvider(),
    status: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100),
    output: vscode.window.createOutputChannel('DeepDive'),
  };

  state.status.command = 'deepdive.studio';

  context.subscriptions.push(
    state.diagnostics,
    state.status,
    state.output,
    vscode.window.registerTreeDataProvider('deepdive.progress', state.tree),
    vscode.commands.registerCommand('deepdive.grade', () => gradeCurrentFile(state)),
    vscode.commands.registerCommand('deepdive.hint', () => showHint(state)),
    vscode.commands.registerCommand('deepdive.refresh', () => refresh(state)),
    vscode.commands.registerCommand('deepdive.studio', async () => {
      const dir = projectDir();
      if (!dir) return;
      try {
        const result = await state.client.studio(dir);
        state.output.appendLine(result.lines.join('\n'));
        state.output.show();
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }),
    vscode.commands.registerCommand('deepdive.doctor', async () => {
      try {
        const result = await state.client.doctor();
        state.output.appendLine(result.lines.join('\n'));
        state.output.show();
      } catch (err) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }),
  );

  void refresh(state);
}

export function deactivate(): void {
  hintPanel?.dispose();
  hintPanel = undefined;
}
