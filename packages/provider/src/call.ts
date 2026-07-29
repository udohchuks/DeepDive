import { z } from 'zod';
import { ModelRequestOptions } from '@deepdive/core';

export class StructuredOutputValidationError extends Error {
  constructor(public originalError: z.ZodError, public attempts: number) {
    super(`Model response failed Zod schema validation after ${attempts} attempts: ${originalError.message}`);
    this.name = 'StructuredOutputValidationError';
  }
}

export class MissingApiKeyError extends Error {
  constructor(providerName: string) {
    super(`API key missing for provider "${providerName}". Please configure your API key.`);
    this.name = 'MissingApiKeyError';
  }
}

export const PINNED_CLAUDE_MODEL = 'claude-3-5-sonnet-20241022'; // Pinned version (D-5)

export async function executeStructuredModelCall<T>(
  options: ModelRequestOptions<T>,
  callFn: (prompt: string, temp: number) => Promise<string>,
): Promise<T> {
  const temperature = options.temperature ?? 0; // Forced temperature 0 (D-2)
  let attempts = 0;
  let lastZodError: z.ZodError | null = null;

  while (attempts < 3) { // Initial call + max 2 retries = 3 attempts total (D-2)
    attempts += 1;
    const rawResponse = await callFn(options.userPrompt, temperature);
    try {
      const parsedJson = JSON.parse(rawResponse);
      return options.schema.parse(parsedJson);
    } catch (err) {
      if (err instanceof z.ZodError) {
        lastZodError = err;
      } else if (err instanceof SyntaxError) {
        lastZodError = new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: [],
            message: `Invalid JSON response: ${err.message}`,
          },
        ]);
      } else {
        throw err;
      }
    }
  }

  throw new StructuredOutputValidationError(lastZodError!, attempts);
}
