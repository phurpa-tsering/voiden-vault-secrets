/**
 * Persists provider settings in Voiden's userData folder. Secret fields
 * (tokens, client secrets, database passwords) are encrypted with Electron's
 * safeStorage (macOS Keychain / Windows DPAPI / libsecret) and never leave the
 * main process. When OS encryption isn't available they are kept in memory
 * for the session only — never written in plain text.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PROVIDERS, providerInfo, sanitizeSettings, type ProviderId } from './catalog';
import { migrateConfig, sanitizeTtl, type StoredConfig } from './configModel';
import type { SecretsStore } from './service';
import type { ConfigView, ProviderView } from './types';

const configPath = () => path.join(app.getPath('userData'), 'plugin-data', 'voiden-vault-secrets', 'config.json');

const secretFields = (id: ProviderId) => providerInfo(id).fields.filter((f) => f.type === 'secret').map((f) => f.key);

export function createConfigStore(): SecretsStore & {
  saveProvider(id: ProviderId, settings?: Record<string, string>, secrets?: Record<string, string | null>): void;
  saveGeneral(general: { cacheTtlSeconds?: number }): void;
  describe(): Omit<ConfigView, 'providerApiAvailable' | 'status'>;
} {
  let config: StoredConfig = migrateConfig(undefined);
  /** Decrypted secrets, keyed "<provider>.<field>". */
  const secrets = new Map<string, string>();

  const encryptionAvailable = () => safeStorage.isEncryptionAvailable();

  function load() {
    try {
      config = migrateConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8')));
    } catch {
      return; // first run or unreadable file — start from defaults
    }
    if (!encryptionAvailable()) return;
    for (const [key, value] of Object.entries(config.encrypted)) {
      try {
        secrets.set(key, safeStorage.decryptString(Buffer.from(value, 'base64')));
      } catch {
        delete config.encrypted[key]; // encrypted by another OS user or keychain — ask again
      }
    }
  }

  function persist() {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  load();

  return {
    getProvider(id) {
      const own: Record<string, string> = {};
      for (const field of secretFields(id)) {
        const value = secrets.get(`${id}.${field}`);
        if (value) own[field] = value;
      }
      return { settings: config.providers[id], secrets: own };
    },

    getCacheTtlSeconds: () => config.cacheTtlSeconds,

    /** For each secret: a string replaces it, null or "" removes it, absent keeps it. */
    saveProvider(id, settings, nextSecrets = {}) {
      if (settings) config.providers[id] = sanitizeSettings(id, settings);
      for (const field of secretFields(id)) {
        if (!(field in nextSecrets)) continue;
        const key = `${id}.${field}`;
        const value = nextSecrets[field]?.trim();
        if (!value) {
          secrets.delete(key);
          delete config.encrypted[key];
        } else {
          secrets.set(key, value);
          if (encryptionAvailable()) config.encrypted[key] = safeStorage.encryptString(value).toString('base64');
          else delete config.encrypted[key]; // session-only: see header comment
        }
      }
      persist();
    },

    saveGeneral(general) {
      if (general.cacheTtlSeconds !== undefined) config.cacheTtlSeconds = sanitizeTtl(general.cacheTtlSeconds);
      persist();
    },

    /** What the settings page may see — never a secret value. */
    describe() {
      const providers = {} as Record<ProviderId, ProviderView>;
      for (const p of PROVIDERS) {
        providers[p.id] = {
          settings: config.providers[p.id],
          secrets: Object.fromEntries(
            secretFields(p.id).map((field) => {
              const key = `${p.id}.${field}`;
              return [field, !secrets.has(key) ? 'none' : config.encrypted[key] ? 'saved' : 'session'];
            }),
          ),
        };
      }
      return { cacheTtlSeconds: config.cacheTtlSeconds, encryptionAvailable: encryptionAvailable(), providers };
    },
  };
}
