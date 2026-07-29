import { Finding, FindingCode, FindingSeverity, FindingSchema } from '@deepdive/core';

export interface RawObservation {
  code: FindingCode;
  severity: FindingSeverity;
  targetFieldId: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  passCount?: number;
  failCount?: number;
  rawUntrustedRepoText?: string; // Untrusted raw repo text to be stripped
}

export function transformToFinding(raw: RawObservation, idGenerator: () => string): Finding {
  const findingCandidate = {
    id: idGenerator(),
    code: raw.code,
    severity: raw.severity,
    targetFieldId: raw.targetFieldId,
    filePath: raw.filePath,
    lineStart: raw.lineStart,
    lineEnd: raw.lineEnd,
    passCount: raw.passCount,
    failCount: raw.failCount,
  };

  // Strictly parse through FindingSchema (strips any raw text fields and validates strict field ID format)
  return FindingSchema.parse(findingCandidate);
}
