export function validatePhaseCArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.tasks && Array.isArray(payload.tasks) && payload.tasks.length > 0);
}
