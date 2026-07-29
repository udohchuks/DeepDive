import { HintLevel, Hint } from '@deepdive/core';
import { HINT_LEVEL_RULES } from '@deepdive/content';

export interface ProgressiveHintState {
  currentLevel: HintLevel;
  revealedHints: Hint[];
}

export class ProgressiveHintController {
  public static getNextLevel(current: HintLevel): HintLevel | null {
    switch (current) {
      case 'L1':
        return 'L2';
      case 'L2':
        return 'L3';
      case 'L3':
        return 'L4';
      case 'L4':
        return null; // L4 is procedural nudge ceiling; cannot request L5
    }
  }

  public static formatHintForDisplay(hint: Hint): string {
    const levelKey = hint.level as HintLevel;
    const rule = HINT_LEVEL_RULES[levelKey];
    return `[${hint.level} - ${rule.name}] ${hint.content}\nNote: ${rule.prohibition}`;
  }
}
