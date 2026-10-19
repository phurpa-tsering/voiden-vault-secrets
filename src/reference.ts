/**
 * Parsing of the key part of a `{{vault.<key>}}` reference.
 *
 *   {{vault.myapp/db#password}}  → secret "myapp/db", field "password"
 *   {{vault.myapp/db_password}}  → secret "myapp",    field "db_password"
 *   {{vault.api_token}}          → secret <default path>, field "api_token"
 *
 * `#` always separates the field explicitly. Without it, the last path
 * segment is the field, and a bare name reads from the configured default path.
 */

export interface SecretReference {
  /** Secret path inside the KV mount, without leading/trailing slashes. */
  path: string;
  /** Field (key) within the secret's data. */
  field: string;
}

const trimSlashes = (value: string) => value.trim().replace(/^\/+|\/+$/g, '');

export function parseReference(key: string, defaultPath: string): SecretReference {
  const raw = key.trim();
  if (!raw) throw new Error('Empty Vault reference — use {{vault.path#field}}.');

  const hash = raw.lastIndexOf('#');
  if (hash !== -1) {
    const path = trimSlashes(raw.slice(0, hash));
    const field = raw.slice(hash + 1).trim();
    if (!path || !field) throw new Error(`Invalid Vault reference "${raw}" — use {{vault.path#field}}.`);
    return { path, field };
  }

  const cleaned = trimSlashes(raw);
  const slash = cleaned.lastIndexOf('/');
  if (slash !== -1) {
    return { path: cleaned.slice(0, slash), field: cleaned.slice(slash + 1) };
  }

  const fallback = trimSlashes(defaultPath);
  if (!fallback) {
    throw new Error(
      `"{{vault.${raw}}}" has no secret path. Use {{vault.path#${raw}}} or set a default secret path in Vault Secrets settings.`,
    );
  }
  return { path: fallback, field: cleaned };
}
