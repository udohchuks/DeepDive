import { z } from 'zod';

export interface ModelRequestOptions<T> {
  role: 'scaffolder' | 'verifier' | 'grader';
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  temperature?: number; // defaults to 0 (D-2)
}

export interface ModelProvider {
  generateStructured<T>(options: ModelRequestOptions<T>): Promise<T>;
}

/** In-Memory Fake Model Provider exported for test use */
export class FakeModelProvider implements ModelProvider {
  private responses = new Map<string, unknown>();

  setResponse<T>(role: string, promptVersion: string, response: T): void {
    this.responses.set(`${role}:${promptVersion}`, response);
  }

  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    const key = `${options.role}:${options.promptVersion}`;
    const value = this.responses.get(key);
    if (value === undefined) {
      throw new Error(`[FakeModelProvider] Cache miss for key: ${key}`);
    }
    return options.schema.parse(value);
  }
}
