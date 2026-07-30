import { RubricDefinition } from '@deepdive/core';

/**
 * Phase OB-A's rubric.
 *
 * Separate from `CharterRubric` because the two charters answer different
 * questions — a greenfield charter states what the student will build, a repo
 * learning charter states what they intend to learn from code that already
 * exists — and because a shared rubric would record onboarding rounds under
 * greenfield phase A, where the completion record would never find them.
 */
export const RepoCharterRubric: RubricDefinition = {
  id: 'rubric_repo_charter_v1',
  phaseId: 'OB-A',
  version: '1.0.0',
  criteria: [
    {
      id: 'repo_charter_intent_declared',
      description: 'Charter must declare the repository, an intent, and a bounded MVP scope',
      kind: 'deterministic',
      codeCheckName: 'check_repo_charter_fields',
    },
    {
      id: 'repo_charter_scope_realistic',
      description:
        'The declared scope is achievable for the stated tier and is genuinely bounded — it names what the student will not attempt',
      kind: 'judged',
    },
  ],
};
