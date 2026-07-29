export function validatePhaseFArtifact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.finalReviewApproved === true);
}
