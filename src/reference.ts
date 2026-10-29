/**
 * Parsing of the key part of a `{{<namespace>.<key>}}` reference.
 *
 * Path-style providers (Vault, Doppler, Infisical):
 *   myapp/db#password  → path "myapp/db", field "password"
 *   myapp/db_password  → path "myapp",    field "db_password"
 *   api_token          → path "" (the provider's default), field "api_token"
 *
 * Item-style providers (Bitwarden, KeePassXC), whose names may contain "/":
 *   Dev/GitHub#UserName → item "Dev/GitHub", field "UserName"
 *   Dev/GitHub          → item "Dev/GitHub", the default field
 */

import { SecretError } from './http';

export interface SecretReference {
  /** Secret path without leading/trailing slashes; "" means the provider's default. */
  path: string;
  /** Field (key) within the secret. */
  field: string;
}

export const trimSlashes = (value: string) => value.trim().replace(/^\/+|\/+$/g, '');

export function parseReference(namespace: string, key: string): SecretReference {
  const raw = key.trim();
  if (!raw) throw new SecretError(`Empty reference — use {{${namespace}.path#field}}.`);

  const hash = raw.lastIndexOf('#');
  if (hash !== -1) {
    const path = trimSlashes(raw.slice(0, hash));
    const field = raw.slice(hash + 1).trim();
    if (!path || !field) throw new SecretError(`Invalid reference "${raw}" — use {{${namespace}.path#field}}.`);
    return { path, field };
  }

  const cleaned = trimSlashes(raw);
  const slash = cleaned.lastIndexOf('/');
  if (slash !== -1) return { path: cleaned.slice(0, slash), field: cleaned.slice(slash + 1) };
  return { path: '', field: cleaned };
}

export function parseItemReference(namespace: string, key: string, defaultField: string): { item: string; field: string } {
  const raw = key.trim();
  const hash = raw.lastIndexOf('#');
  const item = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  const field = hash === -1 ? defaultField : raw.slice(hash + 1).trim();
  if (!item || !field) throw new SecretError(`Invalid reference "${raw}" — use {{${namespace}.item#field}}.`);
  return { item, field };
}

/** Read one field of a secret's data, with an error that lists the fields that do exist. */
export function pickField(data: Record<string, unknown>, field: string, where: string): string {
  if (!(field in data)) {
    const available = Object.keys(data);
    throw new SecretError(`Field "${field}" not found in ${where}` + (available.length ? ` (fields: ${available.join(', ')}).` : '.'));
  }
  const value = data[field];
  return typeof value === 'string' ? value : JSON.stringify(value);
}
