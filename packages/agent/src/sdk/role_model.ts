import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';

export class RoleModelUnavailableError extends Error {
  constructor(providerId: string, modelId: string, available: string[]) {
    const hint = available.length
      ? ` Known ids for this provider: ${available.slice(0, 8).join(', ')}${available.length > 8 ? ', …' : ''}.`
      : ' The provider reported no models.';
    super(`Model "${modelId}" is not available from provider "${providerId}".${hint}`);
    this.name = 'RoleModelUnavailableError';
  }
}

export interface RoleModelOptions {
  providerId: string;
  modelId: string;
  apiKey: string;
  /** Allow pi to refresh model catalogs over the network. Off by default (D-5). */
  allowModelNetwork?: boolean;
}

export interface RoleModel {
  runtime: ModelRuntime;
  model: Model<Api>;
}

/**
 * Builds a pi ModelRuntime authenticated from *our* KeyStore.
 *
 * `setRuntimeApiKey` installs a non-persistent, in-memory credential overlay,
 * so the key is never written to pi's auth.json and pi's own credential
 * discovery is never consulted. BYO-key resolution therefore stays in one place
 * (architecture.md §9b) even though the session itself is pi's.
 *
 * Catalog refresh over the network is off by default: a model list that changes
 * underneath us could silently move a role onto a different model between one
 * submission and the next (D-5).
 */
export async function createRoleModel(options: RoleModelOptions): Promise<RoleModel> {
  const runtime = await ModelRuntime.create({
    allowModelNetwork: options.allowModelNetwork ?? false,
  });

  // setRuntimeApiKey triggers a catalog refresh, and its default options let
  // that refresh reach the network — which hangs when the catalog host is slow
  // or unreachable. Pass the flag explicitly so the refresh stays offline
  // unless network access was asked for.
  await runtime.setRuntimeApiKey(options.providerId, options.apiKey, {
    allowNetwork: options.allowModelNetwork ?? false,
  });

  const model = runtime.getModel(options.providerId, options.modelId);
  if (!model) {
    throw new RoleModelUnavailableError(
      options.providerId,
      options.modelId,
      runtime.getModels(options.providerId).map((m) => m.id),
    );
  }

  return { runtime, model };
}
