import { checkStruggleThreshold } from '@deepdive/content';

export interface StrugglePromptViewState {
  isVisible: boolean;
  fieldId: string;
  options: Array<'request_hint' | 'dismiss'>; // NO solution generation option permitted
}

export class StrugglePromptController {
  public static checkAndTriggerStrugglePrompt(primaryFieldHistory: string[]): StrugglePromptViewState {
    const isStruggling = checkStruggleThreshold(primaryFieldHistory);
    if (!isStruggling) {
      return { isVisible: false, fieldId: '', options: [] };
    }

    const lastField = primaryFieldHistory[primaryFieldHistory.length - 1] ?? '';
    return {
      isVisible: true,
      fieldId: lastField,
      options: ['request_hint', 'dismiss'], // Strictly no solution code button
    };
  }
}
