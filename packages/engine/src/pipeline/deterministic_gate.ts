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
      message: `${testResult.totalFailed} test(s) failing, ${testResult.totalPassed} passing.`,
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
              message: testResult
                ? `${testResult.totalFailed} test(s) failing, ${testResult.totalPassed} passing.`
                : 'No test run was recorded for this submission.',
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
            message: 'Nothing was submitted for this criterion to check.',
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
                // The check's own message says what is wrong with this
                // submission; the criterion description only restates the rule.
                // Prefer the specific one, and fall back rather than printing a
                // bare criterion id, which names the rule but not the fix.
                message: checkRes.message ?? criterion.description,
              });
            }
          } catch (err) {
            failedFindings.push({
              id: makeId(),
              code: 'INVARIANT_VIOLATED',
              severity: 'error',
              targetFieldId: criterion.id,
              // A throwing check is a bug in the rubric, not in the student's
              // work — say so, so they do not go looking for the mistake in
              // their own artifact.
              message: `Code check "${criterion.codeCheckName}" could not run: ${
                err instanceof Error ? err.message : String(err)
              }`,
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
