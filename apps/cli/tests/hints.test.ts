import { describe, it, expect } from 'vitest';
import { Finding, Hint, HintLevel, ModelProvider } from '@deepdive/core';
import { HINT_LEVEL_RULES, L4_PROCEDURAL_CEILING, HintPrompt } from '@deepdive/content';
import {
  buildHintProfile,
  generateHint,
  HintCeilingReachedError,
  HintLevelSkippedError,
  nextHintLevel,
  primaryStickingPoint,
  resolveRequestedLevel,
  shouldOfferHint,
} from '../src/hints.js';

const finding = (targetFieldId: string): Finding => ({
  id: `f-${targetFieldId}`,
  code: 'BOUND_VIOLATED',
  severity: 'error',
  targetFieldId,
});

describe('the ladder escalates one rung at a time', () => {
  it('starts at L1 and climbs', () => {
    expect(nextHintLevel([])).toBe('L1');
    expect(nextHintLevel(['L1'])).toBe('L2');
    expect(nextHintLevel(['L1', 'L2', 'L3'])).toBe('L4');
  });

  it('has no rung above L4', () => {
    // The ceiling is structural, not a prompt request: there is no level to
    // ask for that would give the answer.
    expect(() => nextHintLevel(['L1', 'L2', 'L3', 'L4'])).toThrow(HintCeilingReachedError);
  });

  it('refuses a jump to L4 from the bottom', () => {
    expect(() => resolveRequestedLevel([], 'L4')).toThrow(HintLevelSkippedError);
    expect(() => resolveRequestedLevel(['L1'], 'L3')).toThrow(HintLevelSkippedError);
  });

  it('allows re-reading a level already revealed', () => {
    expect(resolveRequestedLevel(['L1', 'L2'], 'L1')).toBe('L1');
  });

  it('does not refuse for taking too many hints', () => {
    // Reveals are unlimited by design (§7) — no artificial scarcity. The only
    // refusal is at the top of the ladder.
    expect(resolveRequestedLevel(['L1', 'L2'])).toBe('L3');
  });
});

describe('struggle detection offers, it does not intervene', () => {
  it('fires when the same field is primary twice running', () => {
    expect(shouldOfferHint(['scope', 'scope'])).toBe(true);
  });

  it('does not fire for two different problems', () => {
    // Being wrong twice about different things is ordinary progress.
    expect(shouldOfferHint(['title', 'scope'])).toBe(false);
  });

  it('resets when the field changes', () => {
    expect(shouldOfferHint(['scope', 'scope', 'title'])).toBe(false);
  });

  it('never fires on a first round', () => {
    expect(shouldOfferHint([])).toBe(false);
    expect(shouldOfferHint(['scope'])).toBe(false);
  });
});

describe('the ladder attaches to the flagged field', () => {
  it('uses the first finding as the primary sticking point', () => {
    // Exact field-id match, not fuzzy text (§8b).
    expect(primaryStickingPoint([finding('charter_scope_bounded'), finding('other')])).toBe(
      'charter_scope_bounded',
    );
  });

  it('has nothing to attach to when a round has no findings', () => {
    expect(primaryStickingPoint([])).toBeNull();
  });
});

describe('PROTECTED INVARIANT: the ceiling is stated at every level', () => {
  /** Captures the prompt instead of calling a model. */
  class CapturingProvider implements ModelProvider {
    prompts: { system: string; user: string }[] = [];
    async generateStructured<T>(options: {
      systemPrompt: string;
      userPrompt: string;
      schema: { parse(v: unknown): T };
    }): Promise<T> {
      this.prompts.push({ system: options.systemPrompt, user: options.userPrompt });
      return options.schema.parse({ content: 'look at how the scope is bounded' });
    }
  }

  it('sends the no-answer rule even for an L1 orientation hint', async () => {
    const provider = new CapturingProvider();
    await generateHint({
      level: 'L1',
      targetFieldId: 'charter_scope_bounded',
      artifact: { title: 'x' },
      findings: [finding('charter_scope_bounded')],
      alreadyRevealed: [],
      provider: provider as unknown as ModelProvider,
    });

    // A model asked for a gentle hint that happens to know the answer must
    // still not give it, so the ceiling cannot be an L4-only instruction.
    expect(provider.prompts[0]!.system).toContain(L4_PROCEDURAL_CEILING);
    expect(provider.prompts[0]!.user).toContain(HINT_LEVEL_RULES.L1.prohibition);
  });

  it('passes earlier rungs so the ladder reads as one sequence', async () => {
    const provider = new CapturingProvider();
    await generateHint({
      level: 'L3',
      targetFieldId: 'f',
      artifact: {},
      findings: [finding('f')],
      alreadyRevealed: [
        { level: 'L1', content: 'orientation text' },
        { level: 'L2', content: 'localization text' },
      ],
      provider: provider as unknown as ModelProvider,
    });

    expect(provider.prompts[0]!.user).toContain('orientation text');
    expect(provider.prompts[0]!.user).toContain('localization text');
  });

  it('uses the hint prompt, not the grader verdict prompt', () => {
    expect(HintPrompt.systemPrompt).toContain(L4_PROCEDURAL_CEILING);
  });
});

describe('the hint profile is descriptive, not a penalty', () => {
  const hint = (level: HintLevel): Hint => ({
    id: `h-${level}`,
    turnId: 't1',
    level,
    content: 'c',
    revealedAt: '2026-01-01T00:00:00.000Z',
  });

  it('records the highest rung reached and how many were opened', () => {
    const profile = buildHintProfile([
      { phaseId: 'A', turnId: 't1', fieldId: 'scope', hints: [hint('L1'), hint('L2')] },
    ]);

    expect(profile).toEqual([
      {
        phaseId: 'A',
        turnId: 't1',
        fieldId: 'scope',
        highestLevelRevealed: 'L2',
        revealedCount: 2,
      },
    ]);
  });

  it('omits turns where no hint was taken rather than recording a zero', () => {
    expect(buildHintProfile([{ phaseId: 'A', turnId: 't1', fieldId: 'scope', hints: [] }])).toEqual(
      [],
    );
  });

  it('reports the highest level by ladder order, not by reveal order', () => {
    // Re-reading L1 after L3 must not report L1 as the high-water mark.
    const profile = buildHintProfile([
      { phaseId: 'A', turnId: 't1', fieldId: 'f', hints: [hint('L3'), hint('L1')] },
    ]);
    expect(profile[0]!.highestLevelRevealed).toBe('L3');
  });
});
