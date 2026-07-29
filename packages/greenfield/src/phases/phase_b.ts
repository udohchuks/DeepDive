import { SDD, SddSchema } from '@deepdive/core';

export function validatePhaseBArtifact(payload: unknown): SDD {
  return SddSchema.parse(payload);
}
