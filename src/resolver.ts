/**
 * Turns `{{vault.<key>}}` references into secret values, with a short-lived
 * in-memory cache so a request with several references to one secret — or a
 * run of requests — reads it from Vault once.
 */

import { parseReference } from './reference';
import { readKvSecret, VaultError, type FetchLike, type VaultConnection } from './vaultClient';

export interface VaultSettings {
  address: string;
  namespace: string;
  mount: string;
  kvVersion: 1 | 2;
  /** Secret path used by bare references like {{vault.api_token}}. */
  defaultPath: string;
  /** Cache lifetime in seconds; 0 disables caching. */
  cacheTtlSeconds: number;
}

export const DEFAULT_SETTINGS: VaultSettings = {
  address: '',
  namespace: '',
  mount: 'secret',
  kvVersion: 2,
  defaultPath: '',
  cacheTtlSeconds: 60,
};

/**
 * Environment variables that override the saved settings for the active
 * environment — e.g. a staging environment pointing at a different Vault.
 * Keep VAULT_TOKEN in a private environment file, never a public one.
 */
export const ENV_OVERRIDES = {
  address: 'VAULT_ADDR',
  token: 'VAULT_TOKEN',
  namespace: 'VAULT_NAMESPACE',
  mount: 'VAULT_MOUNT',
} as const;

export interface ResolverDeps {
  getSettings(): VaultSettings;
  getToken(): string | undefined;
  fetch: FetchLike;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  data: Promise<Record<string, unknown>>;
}

export function createVaultResolver(deps: ResolverDeps) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  function connectionFor(env: Readonly<Record<string, string>>): { conn: VaultConnection; mount: string; settings: VaultSettings } {
    const settings = deps.getSettings();
    const address = env[ENV_OVERRIDES.address] || settings.address;
    if (!address) {
      throw new VaultError('No Vault address configured — set it in Vault Secrets settings or set VAULT_ADDR in your environment.');
    }
    return {
      conn: {
        address,
        token: env[ENV_OVERRIDES.token] || deps.getToken() || '',
        namespace: env[ENV_OVERRIDES.namespace] || settings.namespace,
      },
      mount: env[ENV_OVERRIDES.mount] || settings.mount,
      settings,
    };
  }

  function readSecret(conn: VaultConnection, mount: string, path: string, settings: VaultSettings) {
    // The token is part of the key so switching tokens never serves another token's reads.
    const cacheKey = [conn.address, conn.namespace ?? '', conn.token, mount, settings.kvVersion, path].join('\u0000');
    const ttlMs = Math.max(0, settings.cacheTtlSeconds) * 1000;
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now()) return hit.data;

    const data = readKvSecret(deps.fetch, conn, mount, path, settings.kvVersion);
    if (ttlMs > 0) {
      cache.set(cacheKey, { expiresAt: now() + ttlMs, data });
      // Don't cache failures — the next request should retry.
      data.catch(() => cache.delete(cacheKey));
    }
    return data;
  }

  /** Resolve one reference key (the part after "vault."). */
  async function resolve(key: string, env: Readonly<Record<string, string>> = {}): Promise<string> {
    const { conn, mount, settings } = connectionFor(env);
    const { path, field } = parseReference(key, settings.defaultPath);
    const data = await readSecret(conn, mount, path, settings);

    if (!(field in data)) {
      const available = Object.keys(data);
      throw new VaultError(
        `Field "${field}" not found in secret "${mount}/${path}"` +
          (available.length ? ` (fields: ${available.join(', ')}).` : '.'),
      );
    }
    const value = data[field];
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  return {
    resolve,
    clearCache: () => cache.clear(),
  };
}
