import { CDD, CddSchema } from '@deepdive/core';

export function validatePhaseObEArtifact(payload: unknown): CDD {
  return CddSchema.parse(payload);
}
