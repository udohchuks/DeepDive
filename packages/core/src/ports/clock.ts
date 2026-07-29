export interface Clock {
  now(): Date;
  isoString(): string;
}

export interface IdGenerator {
  generate(): string;
}

/** Production Clock using system time */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  isoString(): string {
    return new Date().toISOString();
  }
}

/** Deterministic Fake Clock for tests */
export class FixedClock implements Clock {
  constructor(private fixedDate: Date = new Date('2026-01-01T00:00:00.000Z')) {}
  now(): Date {
    return new Date(this.fixedDate);
  }
  isoString(): string {
    return this.fixedDate.toISOString();
  }
  setFixedDate(date: Date): void {
    this.fixedDate = date;
  }
}

/** Production IdGenerator using crypto.randomUUID */
export class CryptoIdGenerator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}

/** Deterministic Fake IdGenerator for tests */
export class FixedIdGenerator implements IdGenerator {
  private counter = 0;
  constructor(private prefix = 'test-id') {}
  generate(): string {
    this.counter += 1;
    if (this.prefix.includes('123e4567')) {
      const hexCounter = this.counter.toString(16).padStart(12, '0');
      return `123e4567-e89b-12d3-a456-${hexCounter}`;
    }
    return `${this.prefix}-${this.counter}`;
  }
  reset(): void {
    this.counter = 0;
  }
}
