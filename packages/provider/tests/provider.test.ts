import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AnthropicModelProvider,
  MissingApiKeyError,
  executeStructuredModelCall,
  StructuredOutputValidationError,
  RecordedFixtureProvider,
  FixtureCacheMissError,
  PINNED_CLAUDE_MODEL,
} from '../src/index.js';

describe('Model Provider & Determinism Controls (Phase 2.3)', () => {
  it('PINNED MODEL: uses pinned model version string, never -latest alias (D-5)', () => {
    expect(PINNED_CLAUDE_MODEL).not.toContain('latest');
    expect(PINNED_CLAUDE_MODEL).toBe('claude-3-5-sonnet-20241022');
  });

  it('handles missing API key cleanly with typed error without leaking secrets', async () => {
    const mockKeyStore = { getApiKey: () => null };
    const provider = new AnthropicModelProvider(mockKeyStore);

    const schema = z.object({ verdict: z.string() });
    await expect(
      provider.generateStructured({
        role: 'grader',
        promptVersion: 'v1',
        systemPrompt: 'System',
        userPrompt: 'User',
        schema,
      }),
    ).rejects.toThrow(MissingApiKeyError);

    // Verify key string never appears in error message
    const err = new MissingApiKeyError('anthropic');
    expect(err.message).not.toContain('sk-');
  });

  it('PROTECTED INVARIANT D-2: invalid model response retried exactly twice then fails typed (never coerced)', async () => {
    let callCount = 0;
    const mockCallFn = async (_prompt: string, _temp: number) => {
      callCount += 1;
      return 'invalid json string payload'; // Fails Zod schema & JSON parse
    };

    const schema = z.object({ verdict: z.string() });

    await expect(
      executeStructuredModelCall(
        {
          role: 'grader',
          promptVersion: 'v1',
          systemPrompt: 'System',
          userPrompt: 'User',
          schema,
          temperature: 0,
        },
        mockCallFn,
      ),
    ).rejects.toThrow(StructuredOutputValidationError);

    // Initial call + 2 retries = 3 calls total
    expect(callCount).toBe(3);
  });

  it('D-4: RecordedFixtureProvider replays fixtures and throws FixtureCacheMissError on miss', async () => {
    const fixtureProvider = new RecordedFixtureProvider();
    const schema = z.object({ verdict: z.string() });

    fixtureProvider.registerFixture('grader', 'v1', 'Submit User Prompt', { verdict: 'approved' });

    const result = await fixtureProvider.generateStructured({
      role: 'grader',
      promptVersion: 'v1',
      systemPrompt: 'System',
      userPrompt: 'Submit User Prompt',
      schema,
    });
    expect(result).toEqual({ verdict: 'approved' });

    // Unregistered payload causes hard FixtureCacheMissError printing missing key
    await expect(
      fixtureProvider.generateStructured({
        role: 'grader',
        promptVersion: 'v1',
        systemPrompt: 'System',
        userPrompt: 'Unseen Prompt Payload',
        schema,
      }),
    ).rejects.toThrow(FixtureCacheMissError);
  });
});
