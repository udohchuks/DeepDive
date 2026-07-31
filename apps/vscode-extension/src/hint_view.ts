import { HINT_LEVEL_RULES } from '@deepdive/content';

export interface HintViewState {
  targetFieldId: string;
  roundNumber?: number;
  phaseId?: string;
  revealed: { level: string; content: string }[];
}

export const LADDER = ['L1', 'L2', 'L3', 'L4'] as const;

/**
 * The next rung, or null at the ceiling.
 *
 * L4 is the ceiling structurally, not by asking a model to decline: there is
 * no L5 to request. The view has no control that could ask for one, which is
 * the same guarantee the CLI gets by raising on a skipped or exceeded level.
 */
export function nextLevel(revealed: readonly { level: string }[]): string | null {
  const highest = revealed.reduce((max, hint) => Math.max(max, LADDER.indexOf(hint.level as 'L1')), -1);
  return highest + 1 < LADDER.length ? LADDER[highest + 1]! : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the ladder.
 *
 * Every revealed rung stays on screen. Re-reading one is free and makes no
 * model call, so there is no reason to hide it — and a rung that vanished
 * after being read would push the student to ask for the next one just to see
 * something, which is exactly the wrong incentive.
 */
export function renderHintHtml(state: HintViewState): string {
  const next = nextLevel(state.revealed);
  const context =
    state.roundNumber !== undefined
      ? `round ${state.roundNumber}${state.phaseId ? `, phase ${escapeHtml(state.phaseId)}` : ''} · `
      : '';

  const rungs = state.revealed
    .map((hint) => {
      const rule = HINT_LEVEL_RULES[hint.level as 'L1'];
      return `<section class="rung">
  <h2>${escapeHtml(hint.level)} · ${escapeHtml(rule?.name ?? '')}</h2>
  <p>${escapeHtml(hint.content)}</p>
  <p class="rule">${escapeHtml(rule?.prohibition ?? '')}</p>
</section>`;
    })
    .join('\n');

  const action = next
    ? `<button id="reveal" data-level="${next}">Reveal ${escapeHtml(next)}</button>
       <p class="note">Taking a hint is recorded. Nothing scores you down for it.</p>`
    : `<p class="ceiling">L4 is the last rung. There is no further level to ask for —
       the rest is yours to work out.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>DeepDive Hints</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         padding: 0 1rem 2rem; line-height: 1.5; }
  h1 { font-size: 1.1rem; }
  .context { color: var(--vscode-descriptionForeground); font-size: 0.9rem; }
  .rung { border-left: 2px solid var(--vscode-textLink-foreground);
          padding-left: 0.9rem; margin: 1.4rem 0; }
  .rung h2 { font-size: 0.95rem; margin: 0 0 0.4rem; }
  .rule { color: var(--vscode-descriptionForeground); font-size: 0.85rem; font-style: italic; }
  .note { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
  .ceiling { border-left: 2px solid var(--vscode-editorWarning-foreground);
             padding-left: 0.9rem; color: var(--vscode-descriptionForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
           border: none; padding: 0.5rem 1rem; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <h1>Stuck on ${escapeHtml(state.targetFieldId)}</h1>
  <p class="context">${context}${state.revealed.length} of ${LADDER.length} rungs revealed</p>
  ${rungs}
  ${action}
<script>
  const vscode = acquireVsCodeApi();
  document.getElementById('reveal')?.addEventListener('click', (e) => {
    vscode.postMessage({ type: 'request_hint', payload: { level: e.target.dataset.level } });
  });
</script>
</body>
</html>`;
}
