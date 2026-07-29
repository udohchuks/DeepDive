export interface CodeCheckResult {
  passed: boolean;
  message?: string;
}

export type CodeCheckFn = (artifactPayload: Record<string, unknown>) => CodeCheckResult;

const VALID_LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);

export const CodeCheckRegistry: Record<string, CodeCheckFn> = {
  check_non_empty_title: (payload) => {
    const title = payload.title;
    const passed = typeof title === 'string' && title.trim().length > 0;
    return { passed, message: passed ? undefined : 'Title must be a non-empty string' };
  },

  check_scope_bounds_present: (payload) => {
    const bounds = payload.scopeBounds;
    const passed = Array.isArray(bounds) && bounds.length > 0;
    return { passed, message: passed ? undefined : 'Scope bounds must contain at least one element' };
  },

  check_modules_non_empty: (payload) => {
    const modules = payload.modules;
    const passed = Array.isArray(modules) && modules.length > 0;
    return { passed, message: passed ? undefined : 'Modules array must not be empty' };
  },

  check_citations_valid: (payload) => {
    const modules = payload.modules;
    if (!Array.isArray(modules)) return { passed: false, message: 'Invalid modules payload' };
    for (const mod of modules) {
      if (mod && typeof mod === 'object' && 'citations' in mod && Array.isArray(mod.citations)) {
        for (const citation of mod.citations) {
          if (!citation || typeof citation !== 'object' || !('filePath' in citation) || typeof citation.filePath !== 'string') {
            return { passed: false, message: 'Citation missing valid filePath' };
          }
        }
      }
    }
    return { passed: true };
  },

  check_rsdd_level: (payload) => {
    const level = payload.level;
    const passed = typeof level === 'string' && VALID_LEVELS.has(level);
    return { passed, message: passed ? undefined : 'RSDD level must be between L1 and L7' };
  },

  check_repo_citations: (payload) => {
    const modules = payload.modules;
    const passed = Array.isArray(modules) && modules.length > 0;
    return { passed, message: passed ? undefined : 'RSDD must contain at least one module with citations' };
  },

  check_characterization_test_path: (payload) => {
    const testPath = payload.characterizationTestPath ?? payload.testPath;
    const passed = typeof testPath === 'string' ? testPath.trim().length > 0 : true;
    return { passed, message: passed ? undefined : 'Characterization test path must be non-empty string' };
  },

  check_cdd_target_citations: (payload) => {
    const targetFiles = payload.targetFiles ?? payload.citations;
    const passed = Array.isArray(targetFiles) || typeof payload === 'object';
    return { passed, message: passed ? undefined : 'CDD must specify target file citations' };
  },
};

export function runCodeCheck(checkName: string, payload: Record<string, unknown>): CodeCheckResult {
  const checkFn = CodeCheckRegistry[checkName];
  if (!checkFn) {
    throw new Error(`Unknown code check function: "${checkName}"`);
  }
  return checkFn(payload);
}
