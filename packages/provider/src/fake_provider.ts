import crypto from 'crypto';
import { ModelProvider, ModelRequestOptions } from '@deepdive/core';

export class FixtureCacheMissError extends Error {
  constructor(public fixtureKey: string) {
    super(
      `[RecordedFixtureProvider] Cache miss for key: "${fixtureKey}"! No recorded fixture exists for this request. Fixture misses are hard errors in test mode (D-4).`,
    );
    this.name = 'FixtureCacheMissError';
  }
}

export class RecordedFixtureProvider implements ModelProvider {
  private fixtures = new Map<string, unknown>();

  public static computeKey(role: string, promptVersion: string, payload: unknown): string {
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 16);
    return `${role}:${promptVersion}:${payloadHash}`;
  }

  public registerFixture<T>(role: string, promptVersion: string, payload: unknown, response: T): string {
    const key = RecordedFixtureProvider.computeKey(role, promptVersion, payload);
    this.fixtures.set(key, response);
    return key;
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const key = RecordedFixtureProvider.computeKey(options.role, options.promptVersion, options.userPrompt);
    const fixture = this.fixtures.get(key);

    if (fixture === undefined) {
      throw new FixtureCacheMissError(key);
    }

    return options.schema.parse(fixture);
  }
}
