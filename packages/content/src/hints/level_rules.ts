import { HintLevel } from '@deepdive/core';

export interface HintLevelRule {
  level: HintLevel;
  name: string;
  ruleDescription: string;
  prohibition: string;
}

export const HINT_LEVEL_RULES: Record<HintLevel, HintLevelRule> = {
  L1: {
    level: 'L1',
    name: 'Orientation',
    ruleDescription: 'General strategy and high-level conceptual guidance without naming specific files or lines.',
    prohibition: 'Do not reference specific file paths, line numbers, or code identifiers.',
  },
  L2: {
    level: 'L2',
    name: 'Localization',
    ruleDescription: 'Points at the relevant existing citation, module, or data flow location.',
    prohibition: 'Do not name the specific fix or exact diagnostic cause.',
  },
  L3: {
    level: 'L3',
    name: 'Diagnostic',
    ruleDescription: 'Names the concrete failing signal, specific code symbol, or test assertion.',
    prohibition: 'Do not provide procedural steps or solution code.',
  },
  L4: {
    level: 'L4',
    name: 'Procedural Nudge',
    ruleDescription: 'Suggests a concrete next action or experiment for the student to perform. NEVER reveals the answer or solution content.',
    prohibition: 'HARD CEILING: NEVER reveals the answer, solution code, or design content under any circumstances.',
  },
};

export const L4_PROCEDURAL_CEILING = 'NEVER reveals the answer, solution code, or design content under any circumstances.';
