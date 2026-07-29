import { RubricDefinition } from '@deepdive/core';

export const SddRubric: RubricDefinition = {
  id: 'rubric_sdd_v1',
  phaseId: 'B',
  version: '1.0.0',
  criteria: [
    {
      id: 'sdd_modules_defined',
      description: 'SDD must define at least one module specification',
      kind: 'deterministic',
      codeCheckName: 'check_modules_non_empty',
    },
    {
      id: 'sdd_citations_valid',
      description: 'All module file citations resolve to valid canonical files and line ranges',
      kind: 'deterministic',
      codeCheckName: 'check_citations_valid',
    },
    {
      id: 'sdd_architectural_coherence',
      description: 'Module breakdown and data flows represent a coherent system architecture',
      kind: 'judged',
    },
  ],
};
