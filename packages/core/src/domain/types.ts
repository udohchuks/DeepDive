import { z } from 'zod';

export const PhaseIdSchema = z.enum([
  'A',
  'B',
  'B.5',
  'C',
  'D',
  'E',
  'F',
  'OB-A',
  'OB-B',
  'OB-C',
  'OB-D',
  'OB-E',
  'OB-F',
  'OB-G',
]);
export type PhaseId = z.infer<typeof PhaseIdSchema>;

export const RoleIdSchema = z.enum(['scaffolder', 'verifier', 'grader']);
export type RoleId = z.infer<typeof RoleIdSchema>;

export const SubmissionStatusSchema = z.enum(['approved', 'revise', 'clarify']);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const CriterionKindSchema = z.enum(['deterministic', 'judged']);
export type CriterionKind = z.infer<typeof CriterionKindSchema>;
