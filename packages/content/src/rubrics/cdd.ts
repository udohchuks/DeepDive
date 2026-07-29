import { RubricDefinition } from '@deepdive/core';

export const CddRubric: RubricDefinition = {
  id: 'rubric_cdd_v1',
  phaseId: 'OB-E',
  version: '1.0.0',
  criteria: [
    {
      id: 'cdd_characterization_test_present',
      description: 'CDD must specify a non-empty characterization test path',
      kind: 'deterministic',
      codeCheckName: 'check_characterization_test_path',
    },
    {
      id: 'cdd_target_files_cited',
      description: 'Proposed fix targets specific cited files and line ranges',
      kind: 'deterministic',
      codeCheckName: 'check_cdd_target_citations',
    },
    {
      id: 'cdd_fix_rationale',
      description: 'Proposed contribution fix logically resolves the identified issue without breaking invariants',
      kind: 'judged',
    },
  ],
};
