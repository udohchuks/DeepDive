import { RubricDefinition } from '@deepdive/core';

export const ReadingPlanRubric: RubricDefinition = {
  id: 'rubric_reading_plan_v1',
  phaseId: 'OB-C',
  version: '1.0.0',
  criteria: [
    {
      id: 'plan_units_present',
      description: 'Reading plan must contain at least one unit, each citing code with line ranges',
      kind: 'deterministic',
      codeCheckName: 'check_reading_units_cited',
    },
    {
      id: 'plan_topologically_ordered',
      description:
        'Every reading unit must appear after the units it depends on (OB-C exit criterion)',
      kind: 'deterministic',
      codeCheckName: 'check_reading_plan_ordered',
    },
    {
      id: 'plan_questions_answerable',
      description:
        'Each unit poses a question that the code it cites can actually answer, and the units together cover the subsystems claimed in the reverse SDD',
      kind: 'judged',
    },
  ],
};
