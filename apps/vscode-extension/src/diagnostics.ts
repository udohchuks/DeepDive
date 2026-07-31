import { Finding } from '@deepdive/core';

export interface DiagnosticSpec {
  /** Character offsets into the artifact source, for `document.positionAt`. */
  start: number;
  end: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  /** The rubric criterion, shown as the diagnostic's code so it is greppable. */
  code: string;
  /** False when the span is the whole-document fallback rather than a real field. */
  located: boolean;
}

/**
 * The JSON field a finding is about, if its message names one.
 *
 * Findings carry a criterion id (`charter_scope_bounded`), not a JSON path, so
 * there is nothing that directly says which key to underline. Code check
 * messages quote the field they are about — `"scopeBounds" must be a non-empty
 * array` — and that convention is what this reads.
 *
 * This is a heuristic, and it is deliberately a visible one: when it finds
 * nothing the diagnostic still appears, on the whole document, rather than
 * being silently dropped. A finding that does not show up at all would be far
 * worse than one placed imprecisely. The principled fix is for code checks to
 * report the field alongside the message; until then this keeps the common
 * case useful without pretending to more precision than it has.
 */
export function fieldFromMessage(message: string | undefined): string | null {
  if (!message) return null;
  const match = /"([A-Za-z_][A-Za-z0-9_]*)"/.exec(message);
  return match ? match[1]! : null;
}

/**
 * Character span of a top-level JSON key in the source text.
 *
 * Matches the key with its quotes so `"scope"` cannot match inside
 * `"scopeBounds"`, and searches the raw text rather than a parsed tree because
 * the point is to point at the file the student is looking at — including when
 * that file does not parse.
 */
export function locateKey(source: string, key: string): { start: number; end: number } | null {
  const pattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`);
  const match = pattern.exec(source);
  if (!match) return null;

  return { start: match.index, end: match.index + key.length + 2 };
}

/** The first non-empty line, so a fallback diagnostic lands somewhere visible. */
function documentFallback(source: string): { start: number; end: number } {
  const firstNewline = source.indexOf('\n');
  return { start: 0, end: firstNewline === -1 ? Math.min(source.length, 80) : firstNewline };
}

/**
 * Turns a round's findings into spans to underline in the artifact.
 *
 * This is the thing the editor can do that a terminal cannot: the rejection
 * appears on the line that caused it, in the file being edited, instead of
 * scrolling past in a log.
 */
export function findingsToDiagnostics(
  findings: readonly Finding[],
  source: string,
): DiagnosticSpec[] {
  return findings.map((finding) => {
    const field = fieldFromMessage(finding.message);
    const span = field ? locateKey(source, field) : null;

    return {
      ...(span ?? documentFallback(source)),
      // Falling back to the criterion id keeps a diagnostic readable even for
      // rounds recorded before findings carried a message.
      message: finding.message ?? `${finding.code} on ${finding.targetFieldId}`,
      severity: finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info',
      code: finding.targetFieldId,
      located: span !== null,
    };
  });
}

/** Which rubric an open file should be graded against, from its filename. */
export function rubricForFile(fileName: string): string | null {
  const base = fileName.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  if (!base.endsWith('.json')) return null;

  const stem = base.slice(0, -'.json'.length);
  const known: Record<string, string> = {
    charter: 'charter',
    sdd: 'sdd',
    'repo-charter': 'repo-charter',
    rsdd: 'rsdd',
    plan: 'plan',
    cdd: 'cdd',
  };

  return known[stem] ?? null;
}
