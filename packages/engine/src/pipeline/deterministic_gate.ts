import { RubricDefinition, Finding, TestRunResult } from '@deepdive/core';

export interface DeterministicGateResult {
  passed: boolean;
  failedFindings: Finding[];
}

export function evaluateDeterministicGate(
  rubric: RubricDefinition,
  testResult?: TestRunResult,
  idGenerator?: () => string,
): DeterministicGateResult {
  const failedFindings: Finding[] = [];
  let idCounter = 0;
  const makeId = idGenerator ?? (() => `123e4567-e89b-12d3-a456-${(++idCounter).toString(16).padStart(12, '0')}`);

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
    if (criterion.kind === 'deterministic') {
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
      }
    }
  }

  return {
    passed: failedFindings.length === 0,
    failedFindings,
  };
}
