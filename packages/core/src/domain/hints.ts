import { z } from 'zod';

export const HintLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4']);
export type HintLevel = z.infer<typeof HintLevelSchema>;

export const HintSchema = z.object({
  id: z.string().uuid(),
  turnId: z.string().uuid(),
  level: HintLevelSchema,
  content: z.string().min(1),
  revealedAt: z.string().datetime(),
});
export type Hint = z.infer<typeof HintSchema>;

export const HintRevealStateSchema = z.object({
  turnId: z.string().uuid(),
  targetFieldId: z.string().min(1),
  highestLevelRevealed: HintLevelSchema.optional(),
  hints: z.array(HintSchema),
});
export type HintRevealState = z.infer<typeof HintRevealStateSchema>;
