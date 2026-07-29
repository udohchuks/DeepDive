import { CompletionRecord, CompletionRecordSchema } from '@deepdive/core';

export function validatePhaseObGArtifact(payload: unknown): CompletionRecord {
  return CompletionRecordSchema.parse(payload);
}
