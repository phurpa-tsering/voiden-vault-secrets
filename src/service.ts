/**
 * Ties the providers to the saved configuration: merges settings, secrets,
 * unsaved drafts and environment overrides, enforces required fields with one
 * consistent message, caches reads and tracks each provider's last status.
 */

import { providerInfo, visibleFields, type ProviderId } from './catalog';
import { createCache } from './cache';
import { SecretError, type ExecLike, type FetchLike } from './http';
import type { Provider, ProviderContext } from './providers/types';
import type { BrowseEntry, Draft, ProviderStatus, TestSummary } from './types';

export interface SecretsStore {
  getProvider(id: ProviderId): { settings: Record<string, string>; secrets: Record<string, string> };
  getCacheTtlSeconds(): number;
}

export interface ServiceDeps {
  store: SecretsStore;
  providers: Record<ProviderId, Provider>;
  fetch: FetchLike;
  exec: ExecLike;
  now?: () => number;
  onStatus?: (id: ProviderId, status: ProviderStatus) => void;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createSecretsService(deps: ServiceDeps) {
  const now = deps.now ?? Date.now;
  const cache = createCache(now);
  const status = new Map<ProviderId, ProviderStatus>();

  function setStatus(id: ProviderId, ok: boolean, message: string) {
    const next = { ok, message, at: now() };
    const prev = status.get(id);
    status.set(id, next);
    if (!prev || prev.ok !== ok || prev.message !== message) deps.onStatus?.(id, next);
  }

  function contextFor(id: ProviderId, env: Readonly<Record<string, string>> = {}, draft?: Draft): ProviderContext {
    const info = providerInfo(id);
    const saved = deps.store.getProvider(id);
    const config: Record<string, string> = { ...saved.settings, ...saved.secrets, ...draft?.settings };
    for (const [key, value] of Object.entries(draft?.secrets ?? {})) {
      if (value === null) delete config[key];
      else if (value) config[key] = value;
    }

    for (const field of info.fields) {
      const fromEnv = field.env && env[field.env];
      if (fromEnv) config[field.key] = fromEnv;
      if (!config[field.key] && field.default) config[field.key] = field.default;
    }

    const missing = visibleFields(info, config).filter((f) => f.required && !config[f.key]?.trim());
    if (missing.length) {
      const what = missing.map((f) => f.label.toLowerCase()).join(' and ');
      const envNames = missing.map((f) => f.env).filter(Boolean);
      throw new SecretError(
        `${info.name} isn't set up: no ${what}. Add it in Vault Secrets settings` +
          (envNames.length ? ` or set ${envNames.join(' / ')} in your environment.` : '.'),
        undefined,
        'not-configured',
      );
    }

    // The scope includes credentials, so switching tokens never serves another token's reads.
    const scope = [id, JSON.stringify(Object.entries(config).sort())].join('\u0000');
    return {
      config,
      fetch: deps.fetch,
      exec: deps.exec,
      cached: (parts, load) => cache.get([scope, ...parts].join('\u0000'), deps.store.getCacheTtlSeconds(), load),
    };
  }

  return {
    /** Resolve a {{namespace.key}} reference for a request. */
    async resolve(id: ProviderId, key: string, env: Readonly<Record<string, string>> = {}): Promise<string> {
      try {
        const value = await deps.providers[id].resolve(key, contextFor(id, env));
        setStatus(id, true, 'Resolved secrets for the last request');
        return value;
      } catch (error) {
        setStatus(id, false, errorMessage(error));
        throw error;
      }
    },

    async test(id: ProviderId, draft?: Draft): Promise<TestSummary> {
      try {
        const result = await deps.providers[id].test(contextFor(id, {}, draft));
        setStatus(id, true, result.summary);
        return result;
      } catch (error) {
        setStatus(id, false, errorMessage(error));
        throw error;
      }
    },

    browse(id: ProviderId, parent?: string, draft?: Draft): Promise<BrowseEntry[]> {
      return deps.providers[id].browse(contextFor(id, {}, draft), parent);
    },

    async action(id: ProviderId, name: string, arg?: string, draft?: Draft): Promise<string> {
      const run = deps.providers[id].actions?.[name];
      if (!run) throw new SecretError(`${providerInfo(id).name} has no "${name}" action.`);
      const message = await run(contextFor(id, {}, draft), arg);
      // Locking, unlocking or syncing changes what reads return.
      cache.clear();
      return message;
    },

    clearCache: () => cache.clear(),
    getStatus: () => Object.fromEntries(status) as Partial<Record<ProviderId, ProviderStatus>>,
  };
}
