import { TestRunResult } from '@deepdive/core';

export function parseTestOutput(framework: 'vitest' | 'jest' | 'cargo' | 'pytest', stdout: string, stderr: string): TestRunResult {
  const combined = stdout + '\n' + stderr;

  if (framework === 'vitest' || framework === 'jest') {
    const passMatch = combined.match(/(\d+)\s+passed/i);
    const failMatch = combined.match(/(\d+)\s+failed/i);

    const totalPassed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const totalFailed = failMatch ? parseInt(failMatch[1], 10) : 0;

    return {
      success: totalFailed === 0 && totalPassed > 0,
      totalPassed,
      totalFailed,
      totalSkipped: 0,
      suites: [{ suiteName: framework, passed: totalPassed, failed: totalFailed, skipped: 0, messages: [] }],
      rawOutput: combined,
    };
  }

  if (framework === 'cargo') {
    const okMatch = combined.match(/test result: ok\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/i);
    if (okMatch) {
      const totalPassed = parseInt(okMatch[1], 10);
      const totalFailed = parseInt(okMatch[2], 10);
      return {
        success: totalFailed === 0,
        totalPassed,
        totalFailed,
        totalSkipped: 0,
        suites: [{ suiteName: 'cargo', passed: totalPassed, failed: totalFailed, skipped: 0, messages: [] }],
        rawOutput: combined,
      };
    }
  }

  if (framework === 'pytest') {
    const match = combined.match(/(\d+)\s+passed/i);
    const failMatch = combined.match(/(\d+)\s+failed/i);
    const totalPassed = match ? parseInt(match[1], 10) : 0;
    const totalFailed = failMatch ? parseInt(failMatch[1], 10) : 0;
    return {
      success: totalFailed === 0 && totalPassed > 0,
      totalPassed,
      totalFailed,
      totalSkipped: 0,
      suites: [{ suiteName: 'pytest', passed: totalPassed, failed: totalFailed, skipped: 0, messages: [] }],
      rawOutput: combined,
    };
  }

  // Fallback
  const hasError = combined.includes('FAIL') || combined.includes('ERR') || combined.includes('error:');
  return {
    success: !hasError,
    totalPassed: hasError ? 0 : 1,
    totalFailed: hasError ? 1 : 0,
    totalSkipped: 0,
    suites: [{ suiteName: 'fallback', passed: hasError ? 0 : 1, failed: hasError ? 1 : 0, skipped: 0, messages: [] }],
    rawOutput: combined,
  };
}
