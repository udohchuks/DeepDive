export const STRUGGLE_DETECTION_RULES = {
  consecutiveThreshold: 2,
  description: 'Proactive offer triggers when the same field is designated as the primary flag across 2 consecutive full resubmissions.',
  resetsOnFieldChange: true,
};

export function checkStruggleThreshold(primaryFieldHistory: string[]): boolean {
  if (primaryFieldHistory.length < STRUGGLE_DETECTION_RULES.consecutiveThreshold) {
    return false;
  }
  const len = primaryFieldHistory.length;
  const last = primaryFieldHistory[len - 1];
  const secondLast = primaryFieldHistory[len - 2];

  return Boolean(last && last === secondLast);
}
