export function validatePhaseObCArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.readingPlan && Array.isArray(payload.readingPlan));
}
