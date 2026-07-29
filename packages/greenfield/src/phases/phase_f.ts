import { z } from 'zod';

export const PhaseFArtifactSchema = z.object({
  finalReviewApproved: z.literal(true),
  portfolioRecordId: z.string().min(1).optional(),
});
export type PhaseFArtifact = z.infer<typeof PhaseFArtifactSchema>;

export function validatePhaseFArtifact(payload: unknown): PhaseFArtifact {
  return PhaseFArtifactSchema.parse(payload);
}
