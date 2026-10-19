import { describe, expect, it, vi } from 'vitest';
import { createVaultResolver, DEFAULT_SETTINGS, type VaultSettings } from '../src/resolver';
import type { FetchLike } from '../src/vaultClient';

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// token: null = no token configured
function setup(overrides: Partial<VaultSettings> = {}, token: string | null = 'root-token') {
  const secrets: Record<string, Record<string, unknown>> = {
    'secret/data/myapp/db': { password: 's3cret', port: 5432 },
    'secret/data/myapp': { api_key: 'key-123' },
  };
  const fetch = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async (url, init) => {
    if (init.headers['X-Vault-Token'] !== 'root-token' && init.headers['X-Vault-Token'] !== 'env-token') return json(403, {});
    const apiPath = new URL(url).pathname.replace(/^\/v1\//, '');
    const data = secrets[decodeURIComponent(apiPath)];
    return data ? json(200, { data: { data } }) : json(404, {});
  });
  let time = 0;
  const settings = { ...DEFAULT_SETTINGS, address: 'https://vault.local:8200', ...overrides };
  const resolver = createVaultResolver({ getSettings: () => settings, getToken: () => token ?? undefined, fetch, now: () => time });
  return { resolver, fetch, advance: (ms: number) => { time += ms; } };
}

describe('vault resolver', () => {
  it('reads a KV v2 field and sends the token', async () => {
    const { resolver, fetch } = setup();
    await expect(resolver.resolve('myapp/db#password')).resolves.toBe('s3cret');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://vault.local:8200/v1/secret/data/myapp/db');
    expect(init.headers['X-Vault-Token']).toBe('root-token');
  });

  it('stringifies non-string values', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve('myapp/db#port')).resolves.toBe('5432');
  });

  it('caches a secret for the TTL and refetches after it', async () => {
    const { resolver, fetch, advance } = setup({ cacheTtlSeconds: 60 });
    await resolver.resolve('myapp/db#password');
    await resolver.resolve('myapp/db#port');
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(61_000);
    await resolver.resolve('myapp/db#password');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache when TTL is 0', async () => {
    const { resolver, fetch } = setup({ cacheTtlSeconds: 0 });
    await resolver.resolve('myapp/db#password');
    await resolver.resolve('myapp/db#password');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lets environment variables override address and token', async () => {
    const { resolver, fetch } = setup({ address: '' }, null);
    await expect(
      resolver.resolve('myapp/api_key', { VAULT_ADDR: 'https://staging-vault:8200', VAULT_TOKEN: 'env-token' }),
    ).resolves.toBe('key-123');
    expect(fetch.mock.calls[0][0]).toBe('https://staging-vault:8200/v1/secret/data/myapp');
  });

  it('gives actionable errors', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve('myapp/db#nope')).rejects.toThrow('Field "nope" not found in secret "secret/myapp/db" (fields: password, port).');
    await expect(resolver.resolve('missing/x#y')).rejects.toThrow(/not found/);
    await expect(setup({}, 'bad').resolver.resolve('myapp/db#password')).rejects.toThrow(/Permission denied/);
    await expect(setup({ address: '' }).resolver.resolve('myapp/db#password')).rejects.toThrow(/No Vault address/);
    await expect(setup({}, null).resolver.resolve('myapp/db#password')).rejects.toThrow(/No Vault token/);
  });

  it('does not cache failures', async () => {
    const { resolver, fetch } = setup();
    await expect(resolver.resolve('missing/x#y')).rejects.toThrow();
    await expect(resolver.resolve('missing/x#y')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the KV v1 path layout', async () => {
    const fetch = vi.fn(async () => json(200, { data: { token: 'v1-value' } }));
    const resolver = createVaultResolver({
      getSettings: () => ({ ...DEFAULT_SETTINGS, address: 'http://127.0.0.1:8200', mount: 'kv', kvVersion: 1 }),
      getToken: () => 't',
      fetch,
    });
    await expect(resolver.resolve('ci#token')).resolves.toBe('v1-value');
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8200/v1/kv/ci');
  });
});
