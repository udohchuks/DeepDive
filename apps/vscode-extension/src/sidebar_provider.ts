import { Finding } from '@deepdive/core';
import { DeepDiveClient } from './deepdive_client.js';
import {
  FormField,
  FormSchema,
  GREENFIELD_RUBRICS,
  ONBOARDING_RUBRICS,
  FORM_SCHEMAS,
  hasContent,
  schemaFor,
  toArtifact,
} from './forms.js';
import { PanelState, renderPanel } from './panel_view.js';

/** Messages the webview can send. There is no message that authors work. */
export type SidebarMessage =
  | { type: 'submit'; values: Record<string, unknown> }
  | { type: 'save'; values: Record<string, unknown> }
  | { type: 'hint'; values?: Record<string, unknown> }
  | { type: 'switch'; rubric: string; values?: Record<string, unknown> }
  | { type: 'refresh' }
  | { type: 'add'; path: string; values: Record<string, unknown> }
  | { type: 'addObject'; path: string; values: Record<string, unknown> }
  | { type: 'remove'; path: string; values: Record<string, unknown> };

/** The editor-facing capabilities the sidebar needs, injected so tests need none. */
export interface SidebarHost {
  render(html: string): void;
  readFile(path: string): string | null;
  writeFile(path: string, contents: string): void;
  join(...parts: string[]): string;
  projectDir(): string | null;
  /** Surfaces a failure that is not a grading result. */
  showError(message: string): void;
}

/**
 * The side panel: the surface a student actually works in.
 *
 * Holds the form state between renders, because a webview is redrawn from
 * scratch on every action and would otherwise lose everything typed since the
 * last save. The panel is the only copy of unsaved edits, so every message
 * carries the current field values back with it — the alternative, keeping a
 * second copy inside the webview's own script, gives two versions of the truth
 * that can disagree about what the student wrote.
 *
 * P-2: nothing here writes into the artifact except the student's own input.
 * There is no message type, and no code path, that fills a field from a model.
 */
export class DeepDiveSidebarProvider {
  private schema: FormSchema | null = schemaFor('charter');
  private values: Record<string, unknown> = {};
  private findings: Finding[] = [];
  private status: string | null = null;
  private hints: { level: string; content: string; targetFieldId: string }[] = [];
  private stats: PanelState['stats'];
  private rounds: PanelState['rounds'] = [];
  private busy = false;
  private notice: string | undefined;

  constructor(
    private readonly host: SidebarHost,
    private readonly client: DeepDiveClient,
  ) {}

  /** Called when the view first becomes visible. */
  async initialize(): Promise<void> {
    this.loadDraft();
    this.render();
    await this.refresh();
  }

  async handleMessage(message: SidebarMessage): Promise<void> {
    if ('values' in message && message.values) this.values = message.values;

    switch (message.type) {
      case 'switch':
        // Save before switching: an unsaved form that vanished because the
        // student looked at another phase would lose real work.
        this.saveDraft();
        this.schema = schemaFor(message.rubric);
        this.findings = [];
        this.status = null;
        this.hints = [];
        this.notice = undefined;
        this.loadDraft();
        break;

      case 'add':
        this.values = mutate(this.values, message.path, 'add');
        break;

      case 'addObject':
        this.values = mutate(this.values, message.path, 'addObject', this.entryTemplate(message.path));
        break;

      case 'remove':
        this.values = mutate(this.values, message.path, 'remove');
        break;

      case 'save':
        this.saveDraft();
        this.notice = `Saved to ${this.schema?.fileName ?? 'disk'}.`;
        break;

      case 'submit':
        await this.submit();
        return;

      case 'hint':
        await this.revealHint();
        return;

      case 'refresh':
        await this.refresh();
        return;
    }

    this.render();
  }

  /**
   * Grades what is in the form.
   *
   * Written to disk first, and graded from the file rather than from the form
   * values. The artifact is the thing on record — a round that graded something
   * with no file behind it could not be re-read later, and the editor and the
   * panel would disagree about what was submitted.
   */
  private async submit(): Promise<void> {
    const dir = this.host.projectDir();
    if (!dir || !this.schema) return;

    if (!hasContent(this.values)) {
      // Not validation: the rubric decides what is good enough. This only
      // stops an empty form from spending a round to be told it is empty.
      this.notice = 'Nothing to submit yet — fill in a field first.';
      this.render();
      return;
    }

    const file = this.saveDraft();
    this.busy = true;
    this.notice = undefined;
    this.render();

    try {
      const result = await this.client.grade(this.schema.rubric, file, dir);
      this.findings = result.findings ?? [];
      this.status = result.status ?? 'revise';
      this.hints = [];
      // The lines carry things findings do not — a citation check that failed
      // before the gate, for instance — so a submission is never silent.
      if (this.findings.length === 0 && this.status !== 'approved') {
        this.notice = result.lines.join('\n') || result.errors.join('\n');
      }
    } catch (err) {
      this.host.showError(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
    }

    await this.refresh();
  }

  private async revealHint(): Promise<void> {
    const dir = this.host.projectDir();
    if (!dir) return;

    this.busy = true;
    this.render();

    try {
      const result = await this.client.hint(dir);
      const field = result.targetFieldId ?? '';

      if (!result.content) {
        this.notice = result.errors[0] ?? 'Nothing to hint at yet — submit something first.';
      } else {
        // Every revealed rung stays: re-reading one is free and costs no model
        // call, and a rung that vanished would push the student to ask for the
        // next just to see something.
        this.hints = [
          ...(result.revealed ?? []).map((h) => ({ ...h, targetFieldId: field })),
          { level: result.level ?? '', content: result.content, targetFieldId: field },
        ].filter((h, index, all) => all.findIndex((other) => other.level === h.level) === index);
      }
    } catch (err) {
      this.host.showError(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async refresh(): Promise<void> {
    const dir = this.host.projectDir();
    if (!dir) {
      this.render();
      return;
    }

    try {
      const result = await this.client.studio(dir);
      this.stats = result.stats;
      this.rounds = result.rounds ?? [];
    } catch {
      // A project with no history yet is the ordinary state of a fresh folder,
      // not a failure worth reporting.
      this.stats = undefined;
      this.rounds = [];
    }

    this.render();
  }

  /** The artifact file for the current phase, beside the project. */
  private draftPath(): string | null {
    const dir = this.host.projectDir();
    return dir && this.schema ? this.host.join(dir, this.schema.fileName) : null;
  }

  /**
   * Reads the artifact back into the form.
   *
   * The file stays the source of truth, so editing `charter.json` directly and
   * then opening the panel shows what is actually on disk rather than a stale
   * copy the panel remembered.
   */
  private loadDraft(): void {
    const file = this.draftPath();
    this.values = {};
    if (!file) return;

    const raw = this.host.readFile(file);
    if (raw === null) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.values = parsed as Record<string, unknown>;
      }
    } catch {
      // A hand-edited file that no longer parses must not silently blank the
      // form and overwrite the student's work on the next save.
      this.notice = `${this.schema?.fileName ?? 'The artifact'} is not valid JSON — fix it in the editor, or overwrite it by saving here.`;
    }
  }

  private saveDraft(): string {
    const file = this.draftPath();
    if (!file) return '';

    this.host.writeFile(file, `${JSON.stringify(toArtifact(this.values), null, 2)}\n`);
    return file;
  }

  /** A blank entry with the right keys, so an added row renders its fields. */
  private entryTemplate(path: string): Record<string, unknown> {
    const field = fieldAtPath(this.schema, path);
    return Object.fromEntries((field?.fields ?? []).map((sub) => [sub.name, sub.kind === 'list' ? [] : '']));
  }

  private render(): void {
    this.host.render(renderPanel(this.state()));
  }

  /** Exposed for tests: the exact state the view is rendered from. */
  state(): PanelState {
    return {
      schema: this.schema,
      available: availableRubrics(this.stats?.phasesApproved ?? []),
      values: this.values,
      findings: this.findings,
      status: this.status,
      stats: this.stats,
      rounds: this.rounds,
      hint: this.hints.length > 0 ? this.hints : undefined,
      busy: this.busy,
      notice: this.notice,
    };
  }

  html(): string {
    return renderPanel(this.state());
  }
}

/**
 * Which phases the picker offers.
 *
 * Both tracks are always listed rather than locked to the one you have started.
 * Locking would mean the tool decides which phase you are on, and deciding the
 * order of your own work is the part that belongs to the student.
 */
export function availableRubrics(
  phasesApproved: readonly string[],
): { rubric: string; title: string; phaseId: string }[] {
  const onboarding = phasesApproved.some((p) => p.startsWith('OB-'));
  const order = onboarding
    ? [...ONBOARDING_RUBRICS, ...GREENFIELD_RUBRICS]
    : [...GREENFIELD_RUBRICS, ...ONBOARDING_RUBRICS];

  return order
    .map((rubric) => FORM_SCHEMAS.find((schema) => schema.rubric === rubric))
    .filter((schema): schema is FormSchema => schema !== undefined)
    .map((schema) => ({ rubric: schema.rubric, title: schema.title, phaseId: schema.phaseId }));
}

/** The field definition a dotted path points at, skipping numeric indices. */
export function fieldAtPath(schema: FormSchema | null, path: string): FormField | null {
  if (!schema) return null;

  let fields: FormField[] = schema.fields;
  let found: FormField | null = null;

  for (const segment of path.split('.')) {
    if (/^\d+$/.test(segment)) continue;
    found = fields.find((field) => field.name === segment) ?? null;
    if (!found) return null;
    fields = found.fields ?? [];
  }

  return found;
}

/**
 * Adds or removes a row at a dotted path.
 *
 * Returns a new object rather than mutating: the previous state is what the
 * panel was last rendered from, and editing it in place would make a failed
 * update indistinguishable from a successful one.
 */
export function mutate(
  values: Record<string, unknown>,
  path: string,
  action: 'add' | 'addObject' | 'remove',
  template: unknown = '',
): Record<string, unknown> {
  const segments = path.split('.');
  const clone = structuredClone(values);

  if (action === 'remove') {
    const index = Number(segments[segments.length - 1]);
    const parent = resolve(clone, segments.slice(0, -1));
    if (Array.isArray(parent) && Number.isInteger(index)) parent.splice(index, 1);
    return clone;
  }

  const target = resolve(clone, segments, true);
  if (Array.isArray(target)) target.push(action === 'addObject' ? template : '');

  return clone;
}

function resolve(root: Record<string, unknown>, segments: string[], create = false): unknown {
  let cursor: unknown = root;

  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;

    const container = cursor as Record<string, unknown>;
    if (container[segment] === undefined) {
      if (!create) return undefined;
      container[segment] = [];
    }
    cursor = container[segment];
  }

  return cursor;
}
