import { AcceptedProjectCharter, AcceptedProjectCharterSchema } from '@deepdive/core';

export function validatePhaseAArtifact(payload: unknown): AcceptedProjectCharter {
  return AcceptedProjectCharterSchema.parse(payload);
}
