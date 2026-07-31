import { Finding } from '@deepdive/core';
import { FormField, FormSchema } from './forms.js';
import { RoundSummary, StudioStats } from './deepdive_client.js';
import { trackFor } from './tree_model.js';

export interface PanelState {
  schema: FormSchema | null;
  /** Rubrics offered in the picker, in phase order. */
  available: { rubric: string; title: string; phaseId: string }[];
  values: Record<string, unknown>;
  findings: Finding[];
  /** Last verdict for this artifact, or null if it has never been submitted. */
  status: string | null;
  stats?: StudioStats;
  rounds: readonly RoundSummary[];
  hint?: { level: string; content: string; targetFieldId: string }[];
  busy?: boolean;
  notice?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Groups findings by the form field they belong under.
 *
 * Two routes, in order. A deterministic finding quotes its field in the
 * message, the same convention the editor diagnostics read. A judged one
 * cannot: the Grader writes prose and the finding carries a criterion id, so
 * the schema's criterion→field map places it. Without the second route every
 * rejection after the gate passes would land in a banner rather than under the
 * box that caused it — and those are the ones worth reading closely.
 *
 * Anything still unplaced goes under a key no field can have, so it is
 * rendered as a banner rather than silently dropped. A finding the student
 * never sees is worse than one shown in the wrong place.
 */
export function findingsByField(
  findings: readonly Finding[],
  schema?: FormSchema | null,
): Map<string, Finding[]> {
  const byCriterion = new Map<string, string>();
  const known = new Set<string>();
  for (const field of schema?.fields ?? []) {
    known.add(field.name);
    for (const criterion of field.criteria ?? []) byCriterion.set(criterion, field.name);
  }

  const byField = new Map<string, Finding[]>();

  for (const finding of findings) {
    // The quoted token only counts when it is a field this form actually has.
    // Grader prose quotes the student's own words back at them, and an
    // unchecked match put a rejection about the goal under whichever word
    // happened to be in quotes.
    const quoted = finding.message ? /"([A-Za-z_][A-Za-z0-9_]*)"/.exec(finding.message)?.[1] : undefined;
    const key =
      (quoted && known.has(quoted) ? quoted : undefined) ??
      byCriterion.get(finding.targetFieldId) ??
      '';
    byField.set(key, [...(byField.get(key) ?? []), finding]);
  }

  return byField;
}

function fieldErrors(findings: Finding[] | undefined): string {
  if (!findings || findings.length === 0) return '';
  return findings
    .map((f) => `<p class="field-error">${escapeHtml(f.message ?? f.targetFieldId)}</p>`)
    .join('');
}

function renderInput(field: FormField, value: unknown, path: string): string {
  const id = escapeHtml(path);

  switch (field.kind) {
    case 'textarea':
      return `<textarea id="${id}" data-path="${id}" rows="4">${escapeHtml(String(value ?? ''))}</textarea>`;

    case 'select':
      return `<select id="${id}" data-path="${id}">
        <option value=""${value ? '' : ' selected'}>—</option>
        ${(field.options ?? [])
          .map(
            (option) =>
              `<option value="${escapeHtml(option)}"${value === option ? ' selected' : ''}>${escapeHtml(option)}</option>`,
          )
          .join('')}
      </select>`;

    case 'number':
      return `<input type="number" id="${id}" data-path="${id}" value="${value === undefined || value === null ? '' : escapeHtml(String(value))}">`;

    case 'list':
      return renderList(field, Array.isArray(value) ? value : [], path);

    case 'objectList':
      return renderObjectList(field, Array.isArray(value) ? value : [], path);

    default:
      return `<input type="text" id="${id}" data-path="${id}" value="${escapeHtml(String(value ?? ''))}">`;
  }
}

function renderList(field: FormField, items: unknown[], path: string): string {
  const rows = items
    .map(
      (item, index) => `<div class="row">
        <input type="text" data-path="${escapeHtml(`${path}.${index}`)}" value="${escapeHtml(String(item ?? ''))}">
        <button class="remove" data-remove="${escapeHtml(`${path}.${index}`)}" title="Remove">✕</button>
      </div>`,
    )
    .join('');

  return `<div class="list">${rows}
    <button class="add" data-add="${escapeHtml(path)}">+ add</button>
  </div>`;
}

function renderObjectList(field: FormField, items: unknown[], path: string): string {
  const entries = items
    .map((item, index) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const inner = (field.fields ?? [])
        .map(
          (sub) => `<label class="sub">
            <span>${escapeHtml(sub.label)}</span>
            ${renderInput(sub, record[sub.name], `${path}.${index}.${sub.name}`)}
          </label>`,
        )
        .join('');

      return `<fieldset class="entry">
        <legend>${escapeHtml(field.label)} ${index + 1}
          <button class="remove" data-remove="${escapeHtml(`${path}.${index}`)}" title="Remove">✕</button>
        </legend>
        ${inner}
      </fieldset>`;
    })
    .join('');

  return `<div class="object-list">${entries}
    <button class="add" data-add-object="${escapeHtml(path)}">+ add ${escapeHtml(field.label.toLowerCase())}</button>
  </div>`;
}

function renderField(field: FormField, values: Record<string, unknown>, errors: Map<string, Finding[]>): string {
  const optional = field.optional ? '<span class="optional">optional</span>' : '';
  const help = field.help ? `<p class="help">${escapeHtml(field.help)}</p>` : '';
  const invalid = errors.has(field.name) ? ' invalid' : '';

  return `<div class="field${invalid}">
    <label for="${escapeHtml(field.name)}"><span class="label">${escapeHtml(field.label)}</span>${optional}</label>
    ${help}
    ${renderInput(field, values[field.name], field.name)}
    ${fieldErrors(errors.get(field.name))}
  </div>`;
}

/**
 * The header card: where you are, and whether you have been showing up.
 *
 * Effort and outcome stay side by side rather than combined, the same rule the
 * CLI studio follows — rounds say you turned up, approved says the work landed,
 * and one number made of both would make a day of hard revision look like a
 * bad day.
 */
function renderProgress(state: PanelState): string {
  if (!state.stats || state.stats.rounds === 0) return '';

  const track = trackFor(state.stats.phasesApproved);
  const done = new Set(state.stats.phasesApproved);
  const pips = track.phases
    .map(
      (phase) =>
        `<span class="pip${done.has(phase) ? ' done' : ''}${state.schema?.phaseId === phase ? ' current' : ''}" title="${escapeHtml(phase)}${done.has(phase) ? ' — approved' : ''}">${escapeHtml(phase)}</span>`,
    )
    .join('');

  const stat = (value: string, label: string) =>
    `<div class="stat"><span class="value">${escapeHtml(value)}</span><span class="name">${escapeHtml(label)}</span></div>`;

  return `<div class="card progress">
    <div class="pips">${pips}</div>
    <div class="stats">
      ${stat(String(state.stats.rounds), 'rounds')}
      ${stat(String(state.stats.approved), 'approved')}
      ${stat(`${state.stats.currentStreak}d`, 'streak')}
      ${stat(String(state.stats.activeDays), 'active days')}
    </div>
  </div>`;
}

function renderVerdict(state: PanelState): string {
  if (state.status === 'approved') {
    return `<div class="verdict approved">Approved. This phase is done — nothing to change.</div>`;
  }

  const unplaced = findingsByField(state.findings, state.schema).get('') ?? [];
  if (state.status && unplaced.length > 0) {
    return `<div class="verdict revise">
      ${unplaced.map((f) => `<p>${escapeHtml(f.message ?? f.targetFieldId)}</p>`).join('')}
    </div>`;
  }

  if (state.status && state.findings.length > 0) {
    return `<div class="verdict revise">Needs revision — see the fields marked below.</div>`;
  }

  return '';
}

function renderHints(state: PanelState): string {
  if (!state.hint || state.hint.length === 0) return '';

  const rungs = state.hint
    .map(
      (h) => `<section class="rung">
        <h4>${escapeHtml(h.level)}</h4>
        <p>${escapeHtml(h.content)}</p>
      </section>`,
    )
    .join('');

  const atCeiling = state.hint.some((h) => h.level === 'L4');
  const action = atCeiling
    ? `<p class="ceiling">L4 is the last rung. The rest is yours to work out.</p>`
    : `<button id="hint" class="secondary">Reveal next hint</button>`;

  return `<details class="hints" open>
    <summary>Hints — on ${escapeHtml(state.hint[0]!.targetFieldId)}</summary>
    ${rungs}
    ${action}
  </details>`;
}

function renderHistory(state: PanelState): string {
  if (state.rounds.length === 0) return '';

  const rows = [...state.rounds]
    .reverse()
    .slice(0, 12)
    .map(
      (round) => `<li class="${escapeHtml(round.status)}">
        <span class="num">${round.roundNumber}</span>
        <span class="phase">${escapeHtml(round.phaseId)}</span>
        <span class="status">${escapeHtml(round.status)}</span>
      </li>`,
    )
    .join('');

  // Rejected rounds stay listed next to approved ones. That history is the
  // product, not clutter to be tidied away once a phase passes.
  return `<details class="history">
    <summary>History (${state.rounds.length})</summary>
    <ul>${rows}</ul>
  </details>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
         color: var(--vscode-foreground); padding: 0.75rem; margin: 0; }
  h2 { font-size: 1rem; margin: 0 0 0.15rem; }
  .purpose { color: var(--vscode-descriptionForeground); font-size: 0.85rem; margin: 0 0 1rem; }
  /* Cards read as one surface in both themes by tinting the editor's own
     foreground colour, rather than hard-coding a light or dark panel. */
  .card { background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px; padding: 0.7rem 0.8rem; margin-bottom: 1rem; }
  .phase-picker { margin-bottom: 0.8rem; }
  .progress .stats { display: flex; gap: 1rem; margin-top: 0.7rem; flex-wrap: wrap; }
  .stat { display: flex; flex-direction: column; }
  .stat .value { font-size: 1.05rem; font-weight: 600; line-height: 1.1; }
  .stat .name { font-size: 0.7rem; color: var(--vscode-descriptionForeground);
                text-transform: uppercase; letter-spacing: 0.03em; }
  .pips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .pip { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 999px;
         border: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); }
  .pip.done { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
              border-color: transparent; }
  .pip.current { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }
  .meta { color: var(--vscode-descriptionForeground); font-size: 0.8rem; margin: 0.4rem 0 0; }
  .field { margin-bottom: 1.1rem; }
  .field.invalid > label .label { color: var(--vscode-editorError-foreground); }
  label { display: block; margin-bottom: 0.25rem; }
  .label { font-weight: 600; font-size: 0.85rem; }
  .optional { color: var(--vscode-descriptionForeground); font-size: 0.75rem; margin-left: 0.4rem; }
  .help { color: var(--vscode-descriptionForeground); font-size: 0.78rem; margin: 0 0 0.35rem; }
  input, textarea, select { width: 100%; padding: 0.35rem 0.45rem;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); font-family: inherit; font-size: inherit; }
  textarea { resize: vertical; }
  .field.invalid input, .field.invalid textarea, .field.invalid select,
  .field.invalid .list, .field.invalid .object-list {
    border-color: var(--vscode-editorError-foreground); }
  .field-error { color: var(--vscode-editorError-foreground); font-size: 0.78rem; margin: 0.3rem 0 0; }
  .row { display: flex; gap: 0.3rem; margin-bottom: 0.3rem; }
  .entry { border: 1px solid var(--vscode-panel-border); padding: 0.5rem; margin-bottom: 0.5rem; }
  .entry legend { font-size: 0.75rem; color: var(--vscode-descriptionForeground); }
  .sub { margin-bottom: 0.5rem; }
  .sub span { font-size: 0.78rem; color: var(--vscode-descriptionForeground); }
  button { font-family: inherit; font-size: 0.82rem; cursor: pointer; border: none;
           padding: 0.4rem 0.7rem; background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.add, button.secondary { background: var(--vscode-button-secondaryBackground);
           color: var(--vscode-button-secondaryForeground); }
  button.remove { background: transparent; color: var(--vscode-descriptionForeground);
                  padding: 0 0.3rem; }
  button[disabled] { opacity: 0.5; cursor: default; }
  .actions { display: flex; gap: 0.5rem; align-items: center; margin: 1rem 0; }
  .verdict { padding: 0.5rem 0.65rem; margin-bottom: 1rem; font-size: 0.85rem;
             border-left: 3px solid; }
  .verdict.approved { border-color: var(--vscode-testing-iconPassed, #3fb950); }
  .verdict.revise { border-color: var(--vscode-editorError-foreground); }
  .verdict p { margin: 0 0 0.3rem; }
  details { margin-top: 1rem; border-top: 1px solid var(--vscode-panel-border); padding-top: 0.6rem; }
  summary { cursor: pointer; font-size: 0.85rem; }
  .rung { border-left: 2px solid var(--vscode-textLink-foreground); padding-left: 0.7rem;
          margin: 0.7rem 0; }
  .rung h4 { margin: 0 0 0.25rem; font-size: 0.8rem; }
  .rung p { margin: 0; font-size: 0.85rem; }
  .ceiling { color: var(--vscode-descriptionForeground); font-size: 0.8rem; }
  .history ul { list-style: none; padding: 0; margin: 0.5rem 0 0; font-size: 0.8rem; }
  .history li { display: flex; gap: 0.5rem; padding: 0.15rem 0;
                color: var(--vscode-descriptionForeground); }
  .history li.approved .status { color: var(--vscode-testing-iconPassed, #3fb950); }
  .notice { font-size: 0.8rem; color: var(--vscode-descriptionForeground); }
  .empty { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
`;

/**
 * Renders the whole panel.
 *
 * One function, one string, no client-side framework: the panel is redrawn
 * from state after every action, so there is no second copy of the truth
 * living in the webview that could disagree with the round history.
 */
export function renderPanel(state: PanelState): string {
  const picker = `<select id="rubric">
    ${state.available
      .map(
        (entry) =>
          `<option value="${escapeHtml(entry.rubric)}"${entry.rubric === state.schema?.rubric ? ' selected' : ''}>${escapeHtml(entry.phaseId)} · ${escapeHtml(entry.title)}</option>`,
      )
      .join('')}
  </select>`;

  const body = state.schema
    ? `<h2>${escapeHtml(state.schema.title)}</h2>
       <p class="purpose">${escapeHtml(state.schema.purpose)}</p>
       ${renderProgress(state)}
       ${renderVerdict(state)}
       <form id="form">
         ${state.schema.fields
           .map((field) => renderField(field, state.values, findingsByField(state.findings, state.schema)))
           .join('')}
       </form>
       <div class="actions">
         <button id="submit"${state.busy ? ' disabled' : ''}>${state.busy ? 'Grading…' : 'Submit for grading'}</button>
         <button id="save" class="secondary"${state.busy ? ' disabled' : ''}>Save draft</button>
       </div>
       ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ''}
       ${renderHints(state)}
       ${renderHistory(state)}`
    : `<p class="empty">Open a folder to start. DeepDive keeps history beside your project.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>${STYLES}</style>
</head>
<body>
  <div class="phase-picker">${picker}</div>
  ${body}
<script>
  const vscode = acquireVsCodeApi();

  function collect() {
    const values = {};
    for (const el of document.querySelectorAll('[data-path]')) {
      const path = el.dataset.path.split('.');
      let cursor = values;
      for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        const nextIsIndex = /^\\d+$/.test(path[i + 1]);
        if (cursor[key] === undefined) cursor[key] = nextIsIndex ? [] : {};
        cursor = cursor[key];
      }
      const last = path[path.length - 1];
      cursor[last] = el.type === 'number' ? (el.value === '' ? undefined : Number(el.value)) : el.value;
    }
    return values;
  }

  function send(type, extra) {
    vscode.postMessage(Object.assign({ type: type, values: collect() }, extra || {}));
  }

  document.getElementById('submit')?.addEventListener('click', () => send('submit'));
  document.getElementById('save')?.addEventListener('click', () => send('save'));
  document.getElementById('hint')?.addEventListener('click', () => send('hint'));
  document.getElementById('rubric')?.addEventListener('change', (e) => {
    send('switch', { rubric: e.target.value });
  });

  for (const button of document.querySelectorAll('[data-add]')) {
    button.addEventListener('click', () => send('add', { path: button.dataset.add }));
  }
  for (const button of document.querySelectorAll('[data-add-object]')) {
    button.addEventListener('click', () => send('addObject', { path: button.dataset.addObject }));
  }
  for (const button of document.querySelectorAll('[data-remove]')) {
    button.addEventListener('click', () => send('remove', { path: button.dataset.remove }));
  }
</script>
</body>
</html>`;
}
