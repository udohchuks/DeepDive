export function validatePhaseObDArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.characterizationTestsPassed === true);
}
