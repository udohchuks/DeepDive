import { Hint, HintLevel } from '../domain/hints.js';

export interface HintServiceOptions {
  turnId: string;
  targetFieldId: string;
  level: HintLevel;
}

export interface HintService {
  revealHint(options: HintServiceOptions): Promise<Hint>;
}

/** In-Memory Fake Hint Service exported for test use */
export class FakeHintService implements HintService {
  private fakeHints = new Map<string, Hint>();

  setFakeHint(turnId: string, level: HintLevel, hint: Hint): void {
    this.fakeHints.set(`${turnId}:${level}`, hint);
  }

  async revealHint(options: HintServiceOptions): Promise<Hint> {
    const key = `${options.turnId}:${options.level}`;
    const hint = this.fakeHints.get(key);
    if (!hint) {
      return {
        id: `fake-hint-${options.level}`,
        turnId: options.turnId,
        level: options.level,
        content: `Fake ${options.level} hint for field ${options.targetFieldId}`,
        revealedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
    }
    return hint;
  }
}
