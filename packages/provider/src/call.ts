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
export const PINNED_DEEPSEEK_MODEL = 'deepseek-chat'; // Pinned DeepSeek model version
export const PINNED_OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet'; // Pinned OpenRouter model slug

export class UnpinnedModelError extends Error {
  constructor(model: string) {
    super(
      `Model "${model}" is a moving alias. Grading must be reproducible (D-5), so pin an explicit dated or versioned model id instead.`,
    );
    this.name = 'UnpinnedModelError';
  }
}

/**
 * Rejects moving aliases such as "-latest".
 *
 * An alias silently changes the grader underneath the student between one
 * submission and the next, which is exactly what D-5 exists to prevent. This
 * runs on operator-supplied overrides, so the failure is loud at construction
 * rather than invisible in a verdict.
 */
export function assertPinnedModel(model: string): string {
  if (/latest|\*/i.test(model)) {
    throw new UnpinnedModelError(model);
  }
  return model;
}

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
