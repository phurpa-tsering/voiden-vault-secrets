/**
 * Minimal HashiCorp Vault HTTP client — KV v1/v2 reads and token lookup.
 * No Electron or Node-only imports, so it can be unit tested with a fake fetch.
 */

export interface VaultConnection {
  /** Base address, e.g. https://vault.example.com:8200 */
  address: string;
  token: string;
  /** Vault Enterprise / HCP namespace (sent as X-Vault-Namespace). */
  namespace?: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

const REQUEST_TIMEOUT_MS = 10_000;

export class VaultError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'VaultError';
  }
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function baseUrl(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new VaultError(`Vault address "${address}" must start with http:// or https://.`);
  }
  return trimmed;
}

async function vaultGet(fetchImpl: FetchLike, conn: VaultConnection, apiPath: string, what: string): Promise<any> {
  if (!conn.token) throw new VaultError('No Vault token configured — add one in Vault Secrets settings or set VAULT_TOKEN in your environment.');

  const headers: Record<string, string> = { 'X-Vault-Token': conn.token, Accept: 'application/json' };
  if (conn.namespace?.trim()) headers['X-Vault-Namespace'] = conn.namespace.trim();

  const url = `${baseUrl(conn.address)}/v1/${apiPath}`;
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new VaultError(`Can't reach Vault at ${baseUrl(conn.address)} (${reason}).`);
  }

  if (response.ok) return response.json();

  switch (response.status) {
    case 401:
    case 403:
      throw new VaultError(`Permission denied reading ${what} — check that the token is valid and its policy allows read.`, response.status);
    case 404:
      throw new VaultError(`${what} not found.`, response.status);
    case 503:
      throw new VaultError('Vault is sealed or unavailable.', response.status);
    default:
      throw new VaultError(`Vault returned HTTP ${response.status} for ${what}.`, response.status);
  }
}

/** Read a KV secret's data (all fields). */
export async function readKvSecret(
  fetchImpl: FetchLike,
  conn: VaultConnection,
  mount: string,
  path: string,
  kvVersion: 1 | 2,
): Promise<Record<string, unknown>> {
  const m = mount.trim().replace(/^\/+|\/+$/g, '') || 'secret';
  const apiPath = kvVersion === 2 ? `${encodePath(m)}/data/${encodePath(path)}` : `${encodePath(m)}/${encodePath(path)}`;
  const body = await vaultGet(fetchImpl, conn, apiPath, `secret "${m}/${path}"`);
  const data = kvVersion === 2 ? body?.data?.data : body?.data;
  if (!data || typeof data !== 'object') {
    throw new VaultError(`Secret "${m}/${path}" has no data${kvVersion === 2 ? ' (deleted, or is the mount KV v1?)' : ''}.`);
  }
  return data;
}

export interface TokenInfo {
  displayName: string;
  policies: string[];
  /** Seconds until expiry; 0 for non-expiring tokens. */
  ttl: number;
}

/** Validate the token and describe it (auth/token/lookup-self). */
export async function lookupSelf(fetchImpl: FetchLike, conn: VaultConnection): Promise<TokenInfo> {
  const body = await vaultGet(fetchImpl, conn, 'auth/token/lookup-self', 'token info');
  return {
    displayName: body?.data?.display_name ?? '',
    policies: Array.isArray(body?.data?.policies) ? body.data.policies : [],
    ttl: typeof body?.data?.ttl === 'number' ? body.data.ttl : 0,
  };
}
