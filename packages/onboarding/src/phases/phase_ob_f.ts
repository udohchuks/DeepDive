export function validatePhaseObFArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.quizPassed === true);
}
