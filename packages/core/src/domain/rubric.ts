import { z } from 'zod';
import { CriterionKindSchema, PhaseIdSchema, SubmissionStatusSchema } from './types.js';

export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  kind: CriterionKindSchema,
  codeCheckName: z.string().optional(),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricDefinitionSchema = z.object({
  id: z.string().min(1),
  phaseId: PhaseIdSchema,
  version: z.string().min(1),
  criteria: z.array(RubricCriterionSchema).min(1),
});
export type RubricDefinition = z.infer<typeof RubricDefinitionSchema>;

export const RubricFlagSchema = z.object({
  id: z.string().min(1),
  criterionId: z.string().min(1),
  targetFieldId: z.string().min(1),
  message: z.string().min(1),
});
export type RubricFlag = z.infer<typeof RubricFlagSchema>;

export const RubricQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
});
export type RubricQuestion = z.infer<typeof RubricQuestionSchema>;

export const RubricVerdictSchema = z.object({
  rubricId: z.string().min(1),
  status: SubmissionStatusSchema,
  flags: z.array(RubricFlagSchema),
  questions: z.array(RubricQuestionSchema),
  primaryStickingFieldId: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type RubricVerdict = z.infer<typeof RubricVerdictSchema>;
