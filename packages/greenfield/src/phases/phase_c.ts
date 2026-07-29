import { z } from 'zod';

export const PhaseCArtifactSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        estimatedHours: z.number().positive().optional(),
      }),
    )
    .min(1),
  version: z.number().int().positive().optional(),
});
export type PhaseCArtifact = z.infer<typeof PhaseCArtifactSchema>;

export function validatePhaseCArtifact(payload: unknown): PhaseCArtifact {
  return PhaseCArtifactSchema.parse(payload);
}
