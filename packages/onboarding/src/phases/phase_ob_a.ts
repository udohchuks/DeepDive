import { RepoLearningCharter, RepoLearningCharterSchema } from '@deepdive/core';

export function validatePhaseObAArtifact(payload: unknown): RepoLearningCharter {
  return RepoLearningCharterSchema.parse(payload);
}
