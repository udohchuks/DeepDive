import { z } from 'zod';

export const FindingCodeSchema = z.enum([
  'CITATION_MISSING',
  'CITATION_VALID',
  'CITATION_INVALID_FILE',
  'CITATION_INVALID_LINE',
  'TEST_SUITE_PASSED',
  'TEST_SUITE_FAILED',
  'SECTION_MISSING',
  'SECTION_PRESENT',
  'INVARIANT_VIOLATED',
  'WORD_COUNT_EXCEEDED',
  'BOUND_VIOLATED',
]);
export type FindingCode = z.infer<typeof FindingCodeSchema>;

export const FindingSeveritySchema = z.enum(['info', 'warning', 'error']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

// Strict structured field ID (alphanumeric, dot, underscore, bracket/index only)
const FieldIdRegex = /^[a-zA-Z0-9_\-[\].]+$/;

export const FindingSchema = z
  .object({
    id: z.string().uuid(),
    code: FindingCodeSchema,
    severity: FindingSeveritySchema,
    targetFieldId: z.string().regex(FieldIdRegex),
    /**
     * Why this finding was raised, in words the student can act on.
     *
     * A criterion id alone ("charter_scope_bounded") names the rule but not the
     * fix, and the deterministic gate is the half of grading meant to teach for
     * free — without this, a rejection pushes the student toward a hint, which
     * costs a model call, to learn something a code check already knew.
     */
    message: z.string().optional(),
    filePath: z.string().optional(),
    lineStart: z.number().int().nonnegative().optional(),
    lineEnd: z.number().int().nonnegative().optional(),
    passCount: z.number().int().nonnegative().optional(),
    failCount: z.number().int().nonnegative().optional(),
  })
  .strict(); // strict ensures no extra unconstrained string properties can be added

export type Finding = z.infer<typeof FindingSchema>;
