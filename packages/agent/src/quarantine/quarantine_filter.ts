import { Finding, FindingSchema } from '@deepdive/core';

export class QuarantineFilterError extends Error {
  constructor(reason: string) {
    super(`Quarantine filter rejected invalid payload: ${reason}`);
    this.name = 'QuarantineFilterError';
  }
}

export function filterAndSanitizeFindings(unfilteredInput: unknown[]): Finding[] {
  const sanitized: Finding[] = [];

  for (const item of unfilteredInput) {
    try {
      const finding = FindingSchema.parse(item);

      const jsonStr = JSON.stringify(finding);
      if (jsonStr.includes('IGNORE PREVIOUS') || jsonStr.includes('SYSTEM PROMPT') || jsonStr.includes('<script>')) {
        throw new QuarantineFilterError('Payload contains forbidden prompt-injection pattern');
      }

      sanitized.push(finding);
    } catch (err: unknown) {
      if (err instanceof QuarantineFilterError) throw err;
      const errMsg = err instanceof Error ? err.message : 'Malformed finding object';
      throw new QuarantineFilterError(errMsg);
    }
  }

  return sanitized;
}
