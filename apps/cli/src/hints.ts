import { z } from 'zod';
import { Finding, Hint, HintLevel, HintProfileEntry, ModelProvider, PhaseId } from '@deepdive/core';
import { buildHintUserPrompt, HintPrompt, HINT_LEVEL_RULES } from '@deepdive/content';

export const HINT_LADDER: HintLevel[] = ['L1', 'L2', 'L3', 'L4'];

export const HintContentSchema = z.object({ content: z.string().min(1) });

export class HintCeilingReachedError extends Error {
  constructor() {
    super(
      `L4 is the top of the ladder: ${HINT_LEVEL_RULES.L4.prohibition} There is no level above it, by design.`,
    );
    this.name = 'HintCeilingReachedError';
  }
}

export class HintLevelSkippedError extends Error {
  constructor(requested: HintLevel, next: HintLevel) {
    super(
      `Cannot reveal ${requested} yet — ${next} is the next rung. The ladder escalates one level at a time so each hint can build on the last.`,
    );
    this.name = 'HintLevelSkippedError';
  }
}

/**
 * The next level to reveal, given what is already open.
 *
 * Reveals are unlimited (§7 — no artificial scarcity), so this never refuses
 * because of how many hints have been taken. It refuses only at the top of the
 * ladder, where the next level would have to be one that reveals the answer.
 */
export function nextHintLevel(revealed: readonly HintLevel[]): HintLevel {
  const highest = HINT_LADDER.filter((level) => revealed.includes(level)).pop();
  if (!highest) return 'L1';

  const next = HINT_LADDER[HINT_LADDER.indexOf(highest) + 1];
  if (!next) throw new HintCeilingReachedError();
  return next;
}

/** Rejects a request to jump up the ladder rather than climb it. */
export function resolveRequestedLevel(
  revealed: readonly HintLevel[],
  requested?: HintLevel,
): HintLevel {
  const next = nextHintLevel(revealed);
  if (!requested) return next;

  // Re-opening a level already revealed is free and changes nothing.
  if (revealed.includes(requested)) return requested;
  if (requested !== next) throw new HintLevelSkippedError(requested, next);
  return next;
}

/**
 * The field a turn's hint ladder attaches to.
 *
 * The architecture ties the ladder to the field the Grader designated as that
 * turn's primary sticking point, matched by exact field id rather than fuzzy
 * text (§8b). With several findings, the first is the primary one.
 */
export function primaryStickingPoint(findings: readonly Finding[]): string | null {
  return findings[0]?.targetFieldId ?? null;
}

/**
 * Whether to proactively offer a hint.
 *
 * Fires when the same field is the primary flag on two consecutive rounds:
 * being wrong twice about different things is ordinary progress, being stuck on
 * the same field twice is the signal. Changing field resets it, so this reads
 * only the tail of the history.
 */
export function shouldOfferHint(primaryFieldHistory: readonly string[]): boolean {
  if (primaryFieldHistory.length < 2) return false;
  const last = primaryFieldHistory[primaryFieldHistory.length - 1];
  return Boolean(last) && last === primaryFieldHistory[primaryFieldHistory.length - 2];
}

export interface GeneratedHint {
  level: HintLevel;
  content: string;
  lines: string[];
}

/**
 * Generates one rung, lazily.
 *
 * One small model call per reveal rather than four at grading time: most turns
 * never climb past L1 or L2, so pre-generating L3 and L4 would pay for content
 * that is usually never read, and would freeze it before the student had a
 * chance to revise in between.
 */
export async function generateHint(input: {
  level: HintLevel;
  targetFieldId: string;
  artifact: Record<string, unknown>;
  findings: Finding[];
  alreadyRevealed: { level: HintLevel; content: string }[];
  provider: ModelProvider;
}): Promise<GeneratedHint> {
  const rule = HINT_LEVEL_RULES[input.level];

  const result = await input.provider.generateStructured({
    role: 'grader',
    promptVersion: HintPrompt.version,
    systemPrompt: HintPrompt.systemPrompt,
    userPrompt: buildHintUserPrompt({
      level: input.level,
      targetFieldId: input.targetFieldId,
      artifact: input.artifact,
      findings: input.findings.map((f) => ({ code: f.code, targetFieldId: f.targetFieldId })),
      alreadyRevealed: input.alreadyRevealed,
    }),
    schema: HintContentSchema,
  });

  return {
    level: input.level,
    content: result.content,
    lines: [
      `${input.level} · ${rule.name} — on ${input.targetFieldId}`,
      '',
      result.content,
      '',
      input.level === 'L4'
        ? 'That is the top of the ladder. There is no level that gives the answer.'
        : `Next: ${HINT_LEVEL_RULES[nextHintLevel([input.level])].name} (deepdive hint)`,
    ],
  };
}

/**
 * Rolls revealed hints into the completion record's profile.
 *
 * Descriptive, never a penalty: the record says which fields needed how much
 * help, which is the useful signal about a learning path, and nothing anywhere
 * reads it to gate or downgrade a completion.
 */
export function buildHintProfile(
  entries: readonly { phaseId: PhaseId; turnId: string; fieldId: string; hints: Hint[] }[],
): HintProfileEntry[] {
  return entries
    .filter((entry) => entry.hints.length > 0)
    .map((entry) => {
      const levels = entry.hints.map((h) => h.level);
      const highest = HINT_LADDER.filter((level) => levels.includes(level)).pop()!;

      return {
        phaseId: entry.phaseId,
        turnId: entry.turnId,
        fieldId: entry.fieldId,
        highestLevelRevealed: highest,
        revealedCount: entry.hints.length,
      };
    });
}
