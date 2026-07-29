import { z } from 'zod';

export const PhaseDArtifactSchema = z.object({
  implementedModules: z.array(z.string().min(1)).min(1),
  testSuitePassed: z.boolean(),
});
export type PhaseDArtifact = z.infer<typeof PhaseDArtifactSchema>;

export function validatePhaseDArtifact(payload: unknown): PhaseDArtifact {
  return PhaseDArtifactSchema.parse(payload);
}
