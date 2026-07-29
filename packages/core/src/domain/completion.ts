import { z } from 'zod';
import { PhaseIdSchema } from './types.js';

export const HintProfileEntrySchema = z.object({
  phaseId: PhaseIdSchema,
  turnId: z.string().uuid(),
  fieldId: z.string().min(1),
  highestLevelRevealed: z.enum(['L1', 'L2', 'L3', 'L4']),
  revealedCount: z.number().int().positive(),
});
export type HintProfileEntry = z.infer<typeof HintProfileEntrySchema>;

export const CompletionRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  mode: z.enum(['greenfield', 'onboarding']),
  charterTitle: z.string().min(1),
  completedPhases: z.array(PhaseIdSchema),
  hintProfile: z.array(HintProfileEntrySchema),
  completedAt: z.string().datetime(),
  contentHash: z.string().length(64), // SHA-256 content hash of artifact & completion (D-7)
});
export type CompletionRecord = z.infer<typeof CompletionRecordSchema>;
