import { RubricDefinition, Finding, TestRunResult, CryptoIdGenerator } from '@deepdive/core';
import { runCodeCheck } from '@deepdive/content';

export interface DeterministicGateResult {
  passed: boolean;
  failedFindings: Finding[];
}

const defaultIdGen = new CryptoIdGenerator();

export function evaluateDeterministicGate(
  rubric: RubricDefinition,
  testResult?: TestRunResult,
  idGenerator?: () => string,
  artifactPayload?: Record<string, unknown>,
): DeterministicGateResult {
  const failedFindings: Finding[] = [];
  const makeId = idGenerator ?? (() => defaultIdGen.generate());

  // Test failure automatically triggers deterministic gate failure
  if (testResult && !testResult.success) {
    failedFindings.push({
      id: makeId(),
      code: 'TEST_SUITE_FAILED',
      severity: 'error',
      targetFieldId: rubric.criteria[0]?.id ?? 'det_test_check',
      failCount: testResult.totalFailed,
      passCount: testResult.totalPassed,
    });
  }

  for (const criterion of rubric.criteria) {
    if (criterion.kind === 'deterministic' && criterion.codeCheckName) {
      if (criterion.codeCheckName === 'check_test_pass' || criterion.codeCheckName === 'check_characterization_test_path') {
        if (!testResult || !testResult.success) {
          if (!failedFindings.some((f) => f.targetFieldId === criterion.id)) {
            failedFindings.push({
              id: makeId(),
              code: 'TEST_SUITE_FAILED',
              severity: 'error',
              targetFieldId: criterion.id,
              failCount: testResult?.totalFailed ?? 1,
              passCount: testResult?.totalPassed ?? 0,
            });
          }
        }
      } else {
        // Fail closed: if artifact payload is missing for a code check, record failure
        if (!artifactPayload) {
          failedFindings.push({
            id: makeId(),
            code: 'BOUND_VIOLATED',
            severity: 'error',
            targetFieldId: criterion.id,
          });
        } else {
          try {
            const checkRes = runCodeCheck(criterion.codeCheckName, artifactPayload);
            if (!checkRes.passed) {
              failedFindings.push({
                id: makeId(),
                code: 'BOUND_VIOLATED',
                severity: 'error',
                targetFieldId: criterion.id,
              });
            }
          } catch {
            failedFindings.push({
              id: makeId(),
              code: 'INVARIANT_VIOLATED',
              severity: 'error',
              targetFieldId: criterion.id,
            });
          }
        }
      }
    }
  }

  return {
    passed: failedFindings.length === 0,
    failedFindings,
  };
}
