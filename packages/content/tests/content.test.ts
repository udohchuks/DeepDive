import { describe, it, expect } from 'vitest';
import {
  ScaffolderPrompt,
  VerifierPrompt,
  GraderPrompt,
  CharterRubric,
  SddRubric,
  RsddRubric,
  CddRubric,
  HINT_LEVEL_RULES,
  L4_PROCEDURAL_CEILING,
  checkStruggleThreshold,
  runCodeCheck,
} from '../src/index.js';
import { RubricDefinitionSchema } from '@deepdive/core';

describe('Content Assets & Golden Snapshots (Phase 4.1)', () => {
  it('D-1: every rubric validates against schema and every criterion carries kind tag & code check if deterministic', () => {
    const rubrics = [CharterRubric, SddRubric, RsddRubric, CddRubric];

    for (const rubric of rubrics) {
      expect(() => RubricDefinitionSchema.parse(rubric)).not.toThrow();

      for (const criterion of rubric.criteria) {
        expect(['deterministic', 'judged']).toContain(criterion.kind);
        if (criterion.kind === 'deterministic') {
          expect(criterion.codeCheckName, `Deterministic criterion ${criterion.id} must name codeCheckName`).toBeDefined();
          expect(criterion.codeCheckName!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('role prompts are versioned, non-empty, and state tool constraints', () => {
    const prompts = [ScaffolderPrompt, VerifierPrompt, GraderPrompt];

    for (const p of prompts) {
      expect(p.version).toBeDefined();
      expect(p.systemPrompt.length).toBeGreaterThan(20);
    }

    expect(ScaffolderPrompt.systemPrompt).toContain('Scaffolder');
    expect(VerifierPrompt.systemPrompt).toContain('raw repository or student-submitted text');
    expect(GraderPrompt.systemPrompt).toContain('NO filesystem or shell execution tools');
  });

  it('PROTECTED INVARIANT: L4 hint rule encodes hard procedural ceiling ("never reveals answer")', () => {
    const l4Rule = HINT_LEVEL_RULES.L4;
    expect(l4Rule.prohibition).toContain('NEVER reveals the answer');
    expect(L4_PROCEDURAL_CEILING).toContain('NEVER reveals the answer');
  });

  it('struggle threshold logic evaluates 2 consecutive resubmissions correctly', () => {
    expect(checkStruggleThreshold(['field_a'])).toBe(false);
    expect(checkStruggleThreshold(['field_a', 'field_b'])).toBe(false);
    expect(checkStruggleThreshold(['field_a', 'field_a'])).toBe(true);
    expect(checkStruggleThreshold(['field_a', 'field_b', 'field_b'])).toBe(true);
  });

  it('D-6: Golden snapshots for prompts and rubrics match expected snapshots', () => {
    expect(ScaffolderPrompt).toMatchSnapshot();
    expect(VerifierPrompt).toMatchSnapshot();
    expect(GraderPrompt).toMatchSnapshot();
    expect(CharterRubric).toMatchSnapshot();
    expect(SddRubric).toMatchSnapshot();
    expect(RsddRubric).toMatchSnapshot();
    expect(CddRubric).toMatchSnapshot();
  });
});

describe('code checks that used to pass everything', () => {
  it('check_cdd_target_citations rejects a proposal that names no file', () => {
    // The old condition was `Array.isArray(x) || typeof payload === 'object'`,
    // whose right-hand side is true for every payload — it could not fail.
    expect(runCodeCheck('check_cdd_target_citations', {}).passed).toBe(false);
    expect(runCodeCheck('check_cdd_target_citations', { targetFiles: [] }).passed).toBe(false);
    expect(
      runCodeCheck('check_cdd_target_citations', { targetFiles: [{ filePath: 'src/a.ts' }] }).passed,
    ).toBe(true);
  });

  it('check_repo_citations requires every module to cite code with line numbers', () => {
    const mod = (citations?: unknown) => ({ modules: [{ name: 'auth', citations }] });

    expect(runCodeCheck('check_repo_citations', mod(undefined)).passed).toBe(false);
    expect(runCodeCheck('check_repo_citations', mod([])).passed).toBe(false);
    // A whole-file citation is not evidence of having read the code.
    expect(runCodeCheck('check_repo_citations', mod([{ filePath: 'a.ts' }])).passed).toBe(false);
    expect(
      runCodeCheck('check_repo_citations', mod([{ filePath: 'a.ts', lineStart: 1, lineEnd: 9 }]))
        .passed,
    ).toBe(true);
  });
});
