import { Finding, FindingSchema } from '@deepdive/core';

export class QuarantineFilterError extends Error {
  constructor(reason: string) {
    super(`Quarantine filter rejected invalid payload: ${reason}`);
    this.name = 'QuarantineFilterError';
  }
}

/**
 * The longest a finding message may be.
 *
 * A finding is a sentence about one field. A model returning several kilobytes
 * of prose is not writing a finding, and whatever it is writing gets rendered
 * in the panel and stored in the round history. Bounding the length bounds that
 * without discarding the finding itself.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Validates and neutralizes findings derived from model output.
 *
 * This used to also scan the serialized finding for three literal strings
 * ('IGNORE PREVIOUS', 'SYSTEM PROMPT', '<script>'). That check is removed
 * rather than extended. It was case-sensitive, so `ignore previous` passed; it
 * matched substrings of the student's own words quoted back by the Grader, so
 * it could reject a legitimate finding; and no list of literals can decide
 * whether prose is an instruction. It read as a boundary while being close to
 * none, which is worse than absent — it invited callers to treat the text as
 * already safe.
 *
 * What remains is what actually holds:
 *  - the schema decides the shape, so no unexpected field survives;
 *  - control characters are stripped, so a message cannot forge structure in a
 *    log line or drive a terminal;
 *  - length is bounded.
 *
 * Injection is contained at the point of use rather than here: findings are
 * rendered escaped, and no consumer feeds a finding message back to a model as
 * instructions.
 */
export function filterAndSanitizeFindings(unfilteredInput: unknown[]): Finding[] {
  const sanitized: Finding[] = [];

  for (const item of unfilteredInput) {
    try {
      const finding = FindingSchema.parse(item);
      sanitized.push(
        finding.message === undefined
          ? finding
          : { ...finding, message: sanitizeMessage(finding.message) },
      );
    } catch (err: unknown) {
      if (err instanceof QuarantineFilterError) throw err;
      const errMsg = err instanceof Error ? err.message : 'Malformed finding object';
      throw new QuarantineFilterError(errMsg);
    }
  }

  return sanitized;
}

/**
 * Strips control characters and bounds length.
 *
 * Carriage returns and escape sequences are the part that matters: a message
 * containing them can overwrite a printed line or move a terminal cursor, which
 * turns a rejection the student is meant to read into one they cannot see.
 * Newlines go too — a finding is one sentence about one field, and a message
 * spanning lines can forge a second finding in the CLI's output.
 */
export function sanitizeMessage(message: string): string {
  const withoutControls = message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  const collapsed = withoutControls.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_MESSAGE_LENGTH
    ? `${collapsed.slice(0, MAX_MESSAGE_LENGTH)}…`
    : collapsed;
}
