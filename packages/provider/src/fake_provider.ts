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

/**
 * A provider that fails if it is called at all.
 *
 * D-1 and P-5 both say a model must not be reached on certain paths, and that
 * was previously asserted against a counter the code under test incremented
 * itself — a test of a convention rather than of the boundary. Injecting a
 * provider that throws moves the assertion onto the thing that actually
 * matters: whether a call would have left the process.
 */
export class NeverCalledProvider implements ModelProvider {
  constructor(private context = 'this path') {}

  async generateStructured<T>(): Promise<T> {
    throw new UnexpectedModelCallError(this.context);
  }
}

export class UnexpectedModelCallError extends Error {
  constructor(context: string) {
    super(`A model call was made from ${context}, which must reach no model.`);
    this.name = 'UnexpectedModelCallError';
  }
}

/**
 * Returns a scripted response and records what it was asked.
 *
 * The recorded requests are the point: a test can assert not only that a call
 * happened but that the prompt carried the artifact and the criteria, which is
 * what distinguishes a real grading call from one that was made with nothing
 * in it.
 */
export class ScriptedProvider implements ModelProvider {
  public readonly requests: ModelRequestOptions<unknown>[] = [];

  constructor(private responses: unknown[]) {}

  get callCount(): number {
    return this.requests.length;
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    this.requests.push(options as ModelRequestOptions<unknown>);
    if (this.responses.length === 0) {
      throw new Error(
        `ScriptedProvider ran out of responses on call ${this.requests.length}. Script one per expected call.`,
      );
    }
    // Parsed with the caller's schema rather than cast, so a scripted response
    // that could not have come from a real grader fails in the test that wrote
    // it instead of passing through as a plausible verdict.
    return options.schema.parse(this.responses.shift());
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
