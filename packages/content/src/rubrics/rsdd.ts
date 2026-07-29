import { RubricDefinition } from '@deepdive/core';

export const RsddRubric: RubricDefinition = {
  id: 'rubric_rsdd_v1',
  phaseId: 'OB-B',
  version: '1.0.0',
  criteria: [
    {
      id: 'rsdd_level_valid',
      description: 'RSDD level must be between L1 and L7',
      kind: 'deterministic',
      codeCheckName: 'check_rsdd_level',
    },
    {
      id: 'rsdd_citations_grounded',
      description: 'Every claimed module in the reverse SDD must carry valid code citations against target repo commit',
      kind: 'deterministic',
      codeCheckName: 'check_repo_citations',
    },
    {
      id: 'rsdd_design_accuracy',
      description: 'Subsystem module responsibilities accurately reflect actual codebase design',
      kind: 'judged',
    },
  ],
};
