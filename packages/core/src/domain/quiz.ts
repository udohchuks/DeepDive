import { z } from 'zod';

export const QuizItemTypeSchema = z.enum([
  'multiple_choice',
  'structured_trace',
  'invariant_explanation',
]);
export type QuizItemType = z.infer<typeof QuizItemTypeSchema>;

export const QuizItemSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  type: QuizItemTypeSchema,
  question: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
});
export type QuizItem = z.infer<typeof QuizItemSchema>;

export const ConceptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  prerequisites: z.array(z.string()),
  category: z.enum(['architecture', 'algorithm', 'system_design', 'testing', 'git']),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const MasteryStateSchema = z.object({
  conceptId: z.string().min(1),
  attemptsCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  lastTestedAt: z.string().datetime().optional(),
  mastered: z.boolean(),
});
export type MasteryState = z.infer<typeof MasteryStateSchema>;
