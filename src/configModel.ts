/**
 * On-disk shape of the plugin's config and the migration from 1.0.x, which
 * only knew HashiCorp Vault. Pure, so it can be tested without Electron.
 */

import { PROVIDERS, sanitizeSettings, type ProviderId } from './catalog';

export const DEFAULT_CACHE_TTL_SECONDS = 60;

export interface StoredConfig {
  version: 2;
  cacheTtlSeconds: number;
  providers: Record<ProviderId, Record<string, string>>;
  /** "<provider>.<field>" → base64 of safeStorage.encryptString(value) */
  encrypted: Record<string, string>;
}

export const sanitizeTtl = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

export function emptyConfig(): StoredConfig {
  return {
    version: 2,
    cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
    providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, sanitizeSettings(p.id)])) as StoredConfig['providers'],
    encrypted: {},
  };
}

/** Read any saved config version into the current shape. */
export function migrateConfig(raw: any): StoredConfig {
  const config = emptyConfig();
  if (!raw || typeof raw !== 'object') return config;

  if (raw.version === 2) {
    config.cacheTtlSeconds = raw.cacheTtlSeconds === undefined ? DEFAULT_CACHE_TTL_SECONDS : sanitizeTtl(raw.cacheTtlSeconds);
    for (const p of PROVIDERS) config.providers[p.id] = sanitizeSettings(p.id, raw.providers?.[p.id]);
    for (const [key, value] of Object.entries(raw.encrypted ?? {})) {
      if (typeof value === 'string') config.encrypted[key] = value;
    }
    return config;
  }

  // 1.0.x: { settings: { address, namespace, mount, kvVersion, defaultPath, cacheTtlSeconds }, encryptedToken }
  const v1 = raw.settings ?? {};
  config.providers.vault = sanitizeSettings('vault', { ...v1, kvVersion: v1.kvVersion === undefined ? undefined : String(v1.kvVersion) });
  if (v1.cacheTtlSeconds !== undefined) config.cacheTtlSeconds = sanitizeTtl(v1.cacheTtlSeconds);
  if (typeof raw.encryptedToken === 'string') config.encrypted['vault.token'] = raw.encryptedToken;
  return config;
}
