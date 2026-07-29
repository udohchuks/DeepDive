export function validatePhaseEArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.integrationTestsPassed === true);
}
