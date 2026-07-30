import { describe, it, expect } from 'vitest';
import {
  MasteryState,
  emptyMastery,
  recordAttempt,
  byTestingPriority,
  MASTERY_SUCCESS_THRESHOLD,
} from '@deepdive/core';
import {
  applyQuizToMastery,
  renderMastery,
  selectFromBank,
  QuizQuestion,
} from '../src/onboarding_phases.js';

const AT = '2026-01-01T00:00:00.000Z';

const question = (id: string, conceptId: string): QuizQuestion => ({
  id,
  conceptId,
  question: `q-${id}`,
  options: ['right', 'wrong'],
  correctAnswer: 'right',
  explanation: 'because',
});

const mastered = (conceptId: string): MasteryState => ({
  conceptId,
  attemptsCount: 2,
  successCount: 2,
  lastTestedAt: AT,
  mastered: true,
});

describe('mastery needs more than one lucky answer', () => {
  it('does not mark a concept mastered on a single correct answer', () => {
    // One right answer on a four-option question is one-in-four by guessing.
    const once = recordAttempt(emptyMastery('c'), true, AT);
    expect(once.mastered).toBe(false);
    expect(MASTERY_SUCCESS_THRESHOLD).toBeGreaterThan(1);
  });

  it('marks it mastered on the second correct answer', () => {
    const twice = recordAttempt(recordAttempt(emptyMastery('c'), true, AT), true, AT);
    expect(twice).toMatchObject({ attemptsCount: 2, successCount: 2, mastered: true });
  });

  it('can lose mastery again when accuracy falls', () => {
    // The flag says "knows this now", not "once answered two right", so it has
    // to be able to go back down.
    let state = recordAttempt(recordAttempt(emptyMastery('c'), true, AT), true, AT);
    expect(state.mastered).toBe(true);

    state = recordAttempt(state, false, AT);
    state = recordAttempt(state, false, AT);
    expect(state.mastered).toBe(false);
    expect(state.successCount).toBe(2); // the successes are not erased, only outweighed
  });

  it('is a pure fold, so the same answers always give the same state', () => {
    const run = () => recordAttempt(recordAttempt(emptyMastery('c'), true, AT), false, AT);
    expect(run()).toEqual(run());
  });
});

describe('the quiz tests what is not yet known', () => {
  const bank = [question('a1', 'auth'), question('s1', 'storage'), question('t1', 'testing')];

  it('puts unmastered concepts first', () => {
    const { chosen } = selectFromBank(bank, [mastered('auth')], 3);
    expect(chosen[chosen.length - 1]!.conceptId).toBe('auth');
  });

  it('spreads across concepts before repeating one', () => {
    const wide = [...bank, question('a2', 'auth'), question('a3', 'auth')];
    const { chosen } = selectFromBank(wide, [], 3);
    expect(new Set(chosen.map((q) => q.conceptId)).size).toBe(3);
  });

  it('reports how many more must be written when the bank is short', () => {
    const { chosen, shortfall } = selectFromBank(bank, [], 5);
    expect(chosen).toHaveLength(3);
    expect(shortfall).toBe(2);
  });

  it('asks for nothing new when the bank already covers the quiz', () => {
    // A question already written costs nothing to re-ask, and re-asking one
    // answered wrong is exactly how the mastery counter is meant to move.
    expect(selectFromBank(bank, [], 2).shortfall).toBe(0);
  });

  it('is deterministic — no shuffle', () => {
    const first = selectFromBank(bank, [], 3).chosen.map((q) => q.id);
    const second = selectFromBank(bank, [], 3).chosen.map((q) => q.id);
    expect(first).toEqual(second);
  });

  it('prefers the least-attempted among equally unmastered concepts', () => {
    const tried: MasteryState = {
      conceptId: 'auth',
      attemptsCount: 3,
      successCount: 1,
      mastered: false,
    };
    const { chosen } = selectFromBank(bank, [tried], 1);
    expect(chosen[0]!.conceptId).not.toBe('auth');
  });
});

describe('PROTECTED INVARIANT: mastery accumulates across sessions', () => {
  it('folds a new quiz onto the state a previous run left behind', () => {
    const previous = [recordAttempt(emptyMastery('auth'), true, AT)];

    const updates = applyQuizToMastery([question('a1', 'auth')], ['right'], previous, AT);

    // Starting from zero each run is what made the bank pointless: the second
    // correct answer has to count as the second.
    expect(updates[0]!.after).toMatchObject({ attemptsCount: 2, mastered: true });
    expect(updates[0]!.before.attemptsCount).toBe(1);
  });

  it('counts a concept asked twice in one quiz as two attempts', () => {
    const updates = applyQuizToMastery(
      [question('a1', 'auth'), question('a2', 'auth')],
      ['right', 'right'],
      [],
      AT,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]!.after).toMatchObject({ attemptsCount: 2, successCount: 2 });
  });

  it('leaves concepts the quiz did not touch alone', () => {
    const updates = applyQuizToMastery([question('a1', 'auth')], ['right'], [mastered('storage')], AT);
    expect(updates.map((u) => u.conceptId)).toEqual(['auth']);
  });

  it('says when a concept was newly mastered, and when it was lost', () => {
    const gained = applyQuizToMastery(
      [question('a1', 'auth')],
      ['right'],
      [recordAttempt(emptyMastery('auth'), true, AT)],
      AT,
    );
    expect(renderMastery(gained).join('\n')).toContain('newly mastered');

    const lost = applyQuizToMastery([question('a1', 'auth')], ['wrong'], [mastered('auth')], AT);
    expect(renderMastery(lost).join('\n')).toContain('no longer mastered');
  });
});

describe('testing priority', () => {
  it('ranks unmastered ahead of mastered regardless of attempts', () => {
    const untouched = emptyMastery('new');
    expect(byTestingPriority(untouched, mastered('old'))).toBeLessThan(0);
  });
});
