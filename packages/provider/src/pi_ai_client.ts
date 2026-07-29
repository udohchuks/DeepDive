import { Clock, SystemClock } from '@deepdive/core';
import { contentText } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Provider } from '@earendil-works/pi-ai';

/**
 * Real model transport, built on @earendil-works/pi-ai.
 *
 * pi-ai is the model layer of the pi harness this project already builds on
 * (architecture.md §2). It ships maintained adapters for Anthropic, DeepSeek,
 * OpenRouter, OpenAI and ~40 other providers, so we reuse it rather than
 * hand-rolling one fetch call per vendor.
 *
 * What this module deliberately does NOT reuse: pi-ai's credential store and
 * OAuth flows. Keys come from our own KeyStore and are passed per call, keeping
 * BYO-key resolution in one place (architecture.md §9b) and leaving no ambient
 * credential path that could pick up a key we did not intend to send.
 */

export class UnknownModelError extends Error {
  constructor(providerId: string, modelId: string, available: string[]) {
    const hint = available.length
      ? ` Known ids include: ${available.slice(0, 8).join(', ')}${available.length > 8 ? ', …' : ''}.`
      : '';
    super(`Model "${modelId}" is not offered by provider "${providerId}".${hint}`);
    this.name = 'UnknownModelError';
  }
}

export class ModelCallFailedError extends Error {
  constructor(providerId: string, modelId: string, detail: string) {
    super(`Model call failed for ${providerId}/${modelId}: ${detail}`);
    this.name = 'ModelCallFailedError';
  }
}

export type PiProviderId = 'anthropic' | 'deepseek' | 'openrouter' | 'openai';

const PROVIDER_FACTORIES: Record<PiProviderId, () => Provider> = {
  anthropic: anthropicProvider as () => Provider,
  deepseek: deepseekProvider as () => Provider,
  openrouter: openrouterProvider as () => Provider,
  openai: openaiProvider as () => Provider,
};

export function isPiProviderId(name: string): name is PiProviderId {
  return name in PROVIDER_FACTORIES;
}

export interface PiModelCallOptions {
  providerId: PiProviderId;
  modelId: string;
  apiKey: string;
  systemPrompt?: string;
  userPrompt: string;
  /** Forced to 0 by the caller (D-2); accepted here so the seam stays explicit. */
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Injectable for tests; defaults to pi-ai's own provider factory. */
  providerFactory?: () => Provider;
  /** Injected rather than read from ambient time (D-3). */
  clock?: Clock;
}

/**
 * Issues one real model call and returns the assistant's text.
 *
 * Streaming is collected into a single result because every call site needs a
 * complete, schema-validatable payload — a partially streamed verdict is not a
 * verdict (D-2).
 */
export async function callPiModel(options: PiModelCallOptions): Promise<string> {
  const factory = options.providerFactory ?? PROVIDER_FACTORIES[options.providerId];
  if (!factory) {
    throw new UnknownModelError(options.providerId, options.modelId, []);
  }

  const clock = options.clock ?? new SystemClock();
  const provider = factory();
  const models = provider.getModels();
  const model = models.find((m) => m.id === options.modelId);

  if (!model) {
    throw new UnknownModelError(
      options.providerId,
      options.modelId,
      models.map((m) => m.id),
    );
  }

  const stream = provider.streamSimple(
    model,
    {
      systemPrompt: options.systemPrompt,
      messages: [{ role: 'user', content: options.userPrompt, timestamp: clock.now().getTime() }],
    },
    {
      temperature: options.temperature ?? 0,
      maxTokens: options.maxTokens,
      apiKey: options.apiKey,
      signal: options.signal,
    },
  );

  const message = await stream.result();

  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new ModelCallFailedError(
      options.providerId,
      options.modelId,
      message.errorMessage ?? message.stopReason,
    );
  }

  return contentText(message.content);
}
