import { z } from 'zod';

export const PhaseEArtifactSchema = z.object({
  integrationTestsPassed: z.literal(true),
  coveragePercentage: z.number().min(0).max(100).optional(),
});
export type PhaseEArtifact = z.infer<typeof PhaseEArtifactSchema>;

export function validatePhaseEArtifact(payload: unknown): PhaseEArtifact {
  return PhaseEArtifactSchema.parse(payload);
}
