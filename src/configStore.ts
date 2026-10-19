/**
 * Persists Vault settings in Voiden's userData folder. The token is encrypted
 * with Electron's safeStorage (macOS Keychain / Windows DPAPI / libsecret) and
 * never leaves the main process. When OS encryption isn't available the token
 * is kept in memory for the session only — never written in plain text.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type VaultSettings } from './resolver';

interface StoredConfig {
  settings: Partial<VaultSettings>;
  /** base64 of safeStorage.encryptString(token) */
  encryptedToken?: string;
}

const configPath = () => path.join(app.getPath('userData'), 'plugin-data', 'voiden-vault-secrets', 'config.json');

function sanitize(input: Partial<VaultSettings>): VaultSettings {
  const s = { ...DEFAULT_SETTINGS, ...input };
  return {
    address: String(s.address ?? '').trim(),
    namespace: String(s.namespace ?? '').trim(),
    mount: String(s.mount ?? '').trim() || DEFAULT_SETTINGS.mount,
    kvVersion: Number(s.kvVersion) === 1 ? 1 : 2,
    defaultPath: String(s.defaultPath ?? '').trim(),
    cacheTtlSeconds: Math.max(0, Math.floor(Number(s.cacheTtlSeconds) || 0)),
  };
}

export function createConfigStore() {
  let settings: VaultSettings = { ...DEFAULT_SETTINGS };
  let token: string | undefined;
  let encryptedToken: string | undefined;

  const encryptionAvailable = () => safeStorage.isEncryptionAvailable();

  function load() {
    try {
      const raw: StoredConfig = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
      settings = sanitize(raw.settings ?? {});
      encryptedToken = raw.encryptedToken;
      token = encryptedToken && encryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'))
        : undefined;
    } catch {
      // first run or unreadable file — start from defaults
    }
  }

  function persist() {
    const file = configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const data: StoredConfig = { settings, ...(encryptedToken ? { encryptedToken } : {}) };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  /** `nextToken`: undefined keeps the current token, null clears it, a string replaces it. */
  function save(next: Partial<VaultSettings>, nextToken?: string | null) {
    settings = sanitize({ ...settings, ...next });
    if (nextToken === null || nextToken === '') {
      token = undefined;
      encryptedToken = undefined;
    } else if (typeof nextToken === 'string') {
      token = nextToken.trim();
      encryptedToken = encryptionAvailable()
        ? safeStorage.encryptString(token).toString('base64')
        : undefined; // session-only: see header comment
    }
    persist();
  }

  load();

  return {
    getSettings: () => settings,
    getToken: () => token,
    save,
    /** What the settings page may see — never the token itself. */
    describe: () => ({
      settings,
      hasToken: !!token,
      tokenPersisted: !!encryptedToken,
      encryptionAvailable: encryptionAvailable(),
    }),
  };
}
