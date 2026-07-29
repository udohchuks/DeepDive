export interface TestSuiteResult {
  suiteName: string;
  passed: number;
  failed: number;
  skipped: number;
  messages: string[];
}

export interface TestRunResult {
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  success: boolean;
  suites: TestSuiteResult[];
  rawOutput: string;
}

export interface TestRunner {
  runTests(workspacePath: string, testCommand?: string): Promise<TestRunResult>;
}

/** In-Memory Fake Test Runner exported for test use */
export class FakeTestRunner implements TestRunner {
  private predefinedResult: TestRunResult = {
    totalPassed: 5,
    totalFailed: 0,
    totalSkipped: 0,
    success: true,
    suites: [{ suiteName: 'fake.test.ts', passed: 5, failed: 0, skipped: 0, messages: [] }],
    rawOutput: '5 passed',
  };

  setResult(result: TestRunResult): void {
    this.predefinedResult = result;
  }

  async runTests(_workspacePath: string, _testCommand?: string): Promise<TestRunResult> {
    return this.predefinedResult;
  }
}
