import { RubricDefinition } from '@deepdive/core';

export const CharterRubric: RubricDefinition = {
  id: 'rubric_charter_v1',
  phaseId: 'A',
  version: '1.0.0',
  criteria: [
    {
      id: 'charter_title_present',
      description: 'Project charter must specify a non-empty title',
      kind: 'deterministic',
      codeCheckName: 'check_non_empty_title',
    },
    {
      id: 'charter_scope_bounded',
      description: 'Project scope bounds must contain at least one explicit non-feature limitation',
      kind: 'deterministic',
      codeCheckName: 'check_scope_bounds_present',
    },
    {
      id: 'charter_goal_clarity',
      description: 'Project goal statement clearly articulates problem domain and learning objective',
      kind: 'judged',
    },
  ],
};
