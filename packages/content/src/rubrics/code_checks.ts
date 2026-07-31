import { checkReadingOrder, ReadingUnit } from '@deepdive/core';

export interface CodeCheckResult {
  passed: boolean;
  message?: string;
}

export type CodeCheckFn = (artifactPayload: Record<string, unknown>) => CodeCheckResult;

const VALID_LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);

/**
 * Messages name the JSON field they are about.
 *
 * "Scope bounds must contain at least one element" reads fine until you have
 * written `scope` and `outOfScope` and cannot tell that the key it wants is
 * `scopeBounds`. The student has no schema in front of them, so a message that
 * describes the rule without naming the field sends them guessing.
 */

export const CodeCheckRegistry: Record<string, CodeCheckFn> = {
  check_non_empty_title: (payload) => {
    const title = payload.title;
    const passed = typeof title === 'string' && title.trim().length > 0;
    return {
      passed,
      message: passed ? undefined : '"title" must be a non-empty string.',
    };
  },

  check_scope_bounds_present: (payload) => {
    const bounds = payload.scopeBounds;
    const passed = Array.isArray(bounds) && bounds.length > 0;
    return {
      passed,
      message: passed
        ? undefined
        : '"scopeBounds" must be a non-empty array naming what this project will not do.',
    };
  },

  check_modules_non_empty: (payload) => {
    const modules = payload.modules;
    const passed = Array.isArray(modules) && modules.length > 0;
    return {
      passed,
      message: passed ? undefined : '"modules" must be a non-empty array.',
    };
  },

  check_citations_valid: (payload) => {
    const modules = payload.modules;
    if (!Array.isArray(modules)) return { passed: false, message: '"modules" must be an array.' };
    for (const mod of modules) {
      if (mod && typeof mod === 'object' && 'citations' in mod && Array.isArray(mod.citations)) {
        for (const citation of mod.citations) {
          if (!citation || typeof citation !== 'object' || !('filePath' in citation) || typeof citation.filePath !== 'string') {
            return {
              passed: false,
              message: 'Every citation in "modules[].citations" needs a string "filePath".',
            };
          }
        }
      }
    }
    return { passed: true };
  },

  check_rsdd_level: (payload) => {
    const level = payload.level;
    const passed = typeof level === 'string' && VALID_LEVELS.has(level);
    return {
      passed,
      message: passed ? undefined : '"level" must be one of L1 through L7.',
    };
  },

  /**
   * Shape-only precheck: every module must carry at least one citation with a
   * file path and a line range.
   *
   * Whether those paths exist at the pinned commit cannot be answered here —
   * code checks are pure and synchronous, and the answer needs the cloned repo.
   * The CLI runs that check against git before calling this gate, so a citation
   * naming a file that does not exist is rejected there. Do not read a pass
   * here as "the citations are grounded".
   */
  check_repo_citations: (payload) => {
    const modules = payload.modules;
    if (!Array.isArray(modules) || modules.length === 0) {
      return { passed: false, message: 'RSDD must contain at least one module' };
    }

    for (const mod of modules) {
      const citations = (mod as { citations?: unknown })?.citations;
      if (!Array.isArray(citations) || citations.length === 0) {
        return {
          passed: false,
          message: `Module "${(mod as { name?: string })?.name ?? '?'}" cites no code. Every claimed module must point at the file it describes.`,
        };
      }

      for (const citation of citations) {
        const c = citation as { filePath?: unknown; lineStart?: unknown; lineEnd?: unknown };
        if (typeof c?.filePath !== 'string' || c.filePath.trim().length === 0) {
          return { passed: false, message: 'Citation missing a filePath' };
        }
        if (!Number.isInteger(c.lineStart) || !Number.isInteger(c.lineEnd)) {
          return {
            passed: false,
            message: `Citation for "${c.filePath}" needs an integer lineStart and lineEnd — a whole-file citation is not evidence.`,
          };
        }
      }
    }

    return { passed: true };
  },

  check_characterization_test_path: (payload) => {
    const testPath = payload.characterizationTestPath ?? payload.testPath;
    const passed = typeof testPath === 'string' ? testPath.trim().length > 0 : true;
    return {
      passed,
      message: passed ? undefined : '"characterizationTestPath" must be a non-empty string.',
    };
  },

  /**
   * `Array.isArray(x) || typeof payload === 'object'` used to stand here, whose
   * right-hand side is true for every payload — the check could not fail. A
   * contribution proposal that names no file is exactly what this is meant to
   * stop, so it now requires at least one citation with a real path.
   */
  check_cdd_target_citations: (payload) => {
    const targetFiles = payload.targetFiles ?? payload.citations;
    if (!Array.isArray(targetFiles) || targetFiles.length === 0) {
      return { passed: false, message: 'CDD must cite at least one target file' };
    }

    for (const citation of targetFiles) {
      const filePath = (citation as { filePath?: unknown })?.filePath;
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return { passed: false, message: 'Every CDD target file needs a filePath' };
      }
    }

    return { passed: true };
  },
  check_repo_charter_fields: (payload) => {
    const repoName = payload.repoName;
    if (typeof repoName !== 'string' || repoName.trim().length === 0) {
      return { passed: false, message: 'Charter must name the repository' };
    }
    if (!['learn', 'contribute', 'replicate'].includes(payload.intent as string)) {
      return { passed: false, message: 'intent must be one of: learn, contribute, replicate' };
    }
    if (!Array.isArray(payload.mvpScope) || payload.mvpScope.length === 0) {
      return {
        passed: false,
        message: 'mvpScope must list at least one thing you will do — an unbounded charter cannot be finished',
      };
    }
    return { passed: true };
  },

  check_reading_units_cited: (payload) => {
    const units = payload.readingPlan;
    if (!Array.isArray(units) || units.length === 0) {
      return { passed: false, message: 'Reading plan must contain at least one unit' };
    }

    for (const unit of units) {
      const u = unit as { id?: unknown; citations?: unknown };
      if (typeof u?.id !== 'string' || u.id.trim().length === 0) {
        return { passed: false, message: 'Every reading unit needs an id' };
      }
      if (!Array.isArray(u.citations) || u.citations.length === 0) {
        return {
          passed: false,
          message: `Unit "${u.id}" cites no code. A unit with nothing to read is not a unit.`,
        };
      }
      for (const citation of u.citations) {
        const c = citation as { filePath?: unknown; lineStart?: unknown; lineEnd?: unknown };
        if (typeof c?.filePath !== 'string' || c.filePath.trim().length === 0) {
          return { passed: false, message: `Unit "${u.id}" has a citation with no filePath` };
        }
        if (!Number.isInteger(c.lineStart) || !Number.isInteger(c.lineEnd)) {
          return {
            passed: false,
            message: `Unit "${u.id}" cites "${c.filePath}" without a line range — "read this file" is not a reading unit.`,
          };
        }
      }
    }

    return { passed: true };
  },

  /**
   * The OB-C exit criterion, decided without a model.
   *
   * "Reading units topologically ordered" is a fact about the dependency graph,
   * so a plan that schedules a caller before the thing it calls is wrong in a
   * way no judgement is needed to establish.
   */
  check_reading_plan_ordered: (payload) => {
    const units = payload.readingPlan;
    if (!Array.isArray(units)) {
      return { passed: false, message: 'Reading plan must be an array of units' };
    }

    for (const unit of units) {
      if (!Array.isArray((unit as { dependsOn?: unknown })?.dependsOn)) {
        return {
          passed: false,
          message: `Unit "${(unit as { id?: string })?.id ?? '?'}" must declare dependsOn (use [] if it depends on nothing)`,
        };
      }
    }

    const result = checkReadingOrder(units as ReadingUnit[]);
    return result.ordered
      ? { passed: true }
      : { passed: false, message: result.problems.join('; ') };
  },
};

export function runCodeCheck(checkName: string, payload: Record<string, unknown>): CodeCheckResult {
  const checkFn = CodeCheckRegistry[checkName];
  if (!checkFn) {
    throw new Error(`Unknown code check function: "${checkName}"`);
  }
  return checkFn(payload);
}
