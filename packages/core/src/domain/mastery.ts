import { MasteryState } from './quiz.js';

/**
 * Correct answers needed before a concept counts as mastered.
 *
 * Two rather than one: a single correct answer on a four-option question is
 * one-in-four by guessing alone, which is not evidence of understanding.
 */
export const MASTERY_SUCCESS_THRESHOLD = 2;

/** A concept is only mastered if most attempts on it were right, not just enough of them. */
export const MASTERY_ACCURACY_THRESHOLD = 0.8;

export function emptyMastery(conceptId: string): MasteryState {
  return { conceptId, attemptsCount: 0, successCount: 0, mastered: false };
}

/**
 * Folds one answer into a concept's mastery state.
 *
 * Pure, so the same answer history always yields the same state and replaying
 * the record cannot drift from what was displayed at the time.
 *
 * Mastery can be lost again. Requiring accuracy rather than only a count means
 * a concept answered right twice and then wrong repeatedly stops reading as
 * mastered — otherwise the flag would record that a student once knew
 * something, which is not what it is used for.
 */
export function recordAttempt(
  state: MasteryState,
  correct: boolean,
  testedAt: string,
): MasteryState {
  const attemptsCount = state.attemptsCount + 1;
  const successCount = state.successCount + (correct ? 1 : 0);

  return {
    conceptId: state.conceptId,
    attemptsCount,
    successCount,
    lastTestedAt: testedAt,
    mastered:
      successCount >= MASTERY_SUCCESS_THRESHOLD &&
      successCount / attemptsCount >= MASTERY_ACCURACY_THRESHOLD,
  };
}

/**
 * Orders concepts by how much they still need testing.
 *
 * Unmastered first, and within those the least-attempted first, so a quiz
 * spreads across what the student has not shown they know rather than drilling
 * whichever concept happens to sort first.
 */
export function byTestingPriority(a: MasteryState, b: MasteryState): number {
  if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
  return a.attemptsCount - b.attemptsCount;
}
