import { z } from 'zod';
import { Finding, ModelProvider, RubricDefinition } from '@deepdive/core';
import { CharterRubric, SddRubric, GraderPrompt } from '@deepdive/content';
import { evaluateDeterministicGate } from '@deepdive/engine';

/** Rubrics reachable from the CLI, keyed by the name a student would type. */
export const CLI_RUBRICS: Record<string, RubricDefinition> = {
  charter: CharterRubric,
  sdd: SddRubric,
};

/**
 * The Grader's structured output. Validated with Zod and never coerced: an
 * unparseable verdict is a failed call, not a verdict (D-2).
 */
export const GraderVerdictSchema = z.object({
  verdict: z.enum(['approved', 'revise', 'clarifying_question']),
  criterionFindings: z.array(
    z.object({
      criterionId: z.string(),
      met: z.boolean(),
      comment: z.string(),
    }),
  ),
});

export type GraderVerdict = z.infer<typeof GraderVerdictSchema>;

export interface GradeResult {
  lines: string[];
  shortCircuited: boolean;
  verdict?: GraderVerdict;
  /** Deterministic-gate findings, surfaced so they can be persisted. */
  findings: Finding[];
}

/**
 * Runs the deterministic gate first and only calls the model if it passes.
 *
 * This is D-1 (deterministic-first grading) made visible at the command line:
 * a charter missing its title is rejected by a code check, for free, with no
 * model call and no variability between runs.
 */
export async function runGrade(
  rubricName: string,
  artifactPayload: Record<string, unknown>,
  provider: ModelProvider,
): Promise<GradeResult> {
  const rubric = CLI_RUBRICS[rubricName];
  if (!rubric) {
    throw new Error(
      `Unknown rubric "${rubricName}". Available: ${Object.keys(CLI_RUBRICS).join(', ')}.`,
    );
  }

  const lines: string[] = [];
  const gate = evaluateDeterministicGate(rubric, undefined, undefined, artifactPayload);

  if (!gate.passed) {
    lines.push('deterministic gate: FAILED — no model call made');
    for (const finding of gate.failedFindings) {
      lines.push(`  - [${finding.severity}] ${finding.code} on ${finding.targetFieldId}`);
    }
    return { lines, shortCircuited: true, findings: gate.failedFindings };
  }

  lines.push('deterministic gate: passed');

  const judged = rubric.criteria.filter((c) => c.kind === 'judged');
  if (judged.length === 0) {
    lines.push('no judged criteria for this rubric — nothing to send to the model');
    return { lines, shortCircuited: true, findings: [] };
  }

  lines.push(`calling model for ${judged.length} judged criterion/criteria…`);

  const verdict = await provider.generateStructured({
    role: 'grader',
    promptVersion: GraderPrompt.version,
    systemPrompt: GraderPrompt.systemPrompt,
    userPrompt: JSON.stringify(
      {
        rubricId: rubric.id,
        criteria: judged.map((c) => ({ id: c.id, description: c.description })),
        artifact: artifactPayload,
        instructions:
          'Return JSON matching {"verdict":"approved"|"revise"|"clarifying_question","criterionFindings":[{"criterionId":string,"met":boolean,"comment":string}]}. Do not propose replacement text for the student.',
      },
      null,
      2,
    ),
    schema: GraderVerdictSchema,
  });

  lines.push(`verdict: ${verdict.verdict}`);
  for (const finding of verdict.criterionFindings) {
    lines.push(`  - ${finding.met ? 'met' : 'not met'} ${finding.criterionId}: ${finding.comment}`);
  }

  return { lines, shortCircuited: false, verdict, findings: [] };
}
