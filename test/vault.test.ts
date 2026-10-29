import { describe, expect, it } from 'vitest';
import { fakeFetch, json, setup } from './helpers';

const SECRETS: Record<string, Record<string, unknown>> = {
  'secret/data/myapp/db': { password: 's3cret', port: 5432 },
  'secret/data/myapp': { api_key: 'key-123' },
};

function vault(settings: Record<string, string> = {}, token: string | null = 'root-token', ttl?: number) {
  const fetch = fakeFetch((url, init) => {
    if (!['root-token', 'env-token'].includes(init.headers['X-Vault-Token'])) return json(403, {});
    const apiPath = decodeURIComponent(url.pathname.replace(/^\/v1\//, ''));
    if (url.searchParams.get('list') === 'true') {
      if (apiPath === 'secret/metadata/') return json(200, { data: { keys: ['myapp/', 'top'] } });
      if (apiPath === 'secret/metadata/myapp/') return json(200, { data: { keys: ['db'] } });
      return undefined;
    }
    if (apiPath === 'auth/token/lookup-self') return json(200, { data: { display_name: 'token-ci', policies: ['default', 'myapp'], ttl: 7200 } });
    const data = SECRETS[apiPath];
    return data ? json(200, { data: { data } }) : undefined;
  });
  const ctx = setup({
    provider: 'vault',
    settings: { address: 'https://vault.local:8200', ...settings },
    secrets: token ? { token } : {},
    fetch,
    ttl,
  });
  return { ...ctx, fetch };
}

describe('vault provider', () => {
  it('reads a KV v2 field and sends the token', async () => {
    const { resolve, fetch } = vault();
    await expect(resolve('myapp/db#password')).resolves.toBe('s3cret');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://vault.local:8200/v1/secret/data/myapp/db');
    expect(init.headers['X-Vault-Token']).toBe('root-token');
  });

  it('stringifies non-string values', async () => {
    await expect(vault().resolve('myapp/db#port')).resolves.toBe('5432');
  });

  it('reads bare names from the default path', async () => {
    await expect(vault({ defaultPath: '/myapp/' }).resolve('api_key')).resolves.toBe('key-123');
    await expect(vault().resolve('api_key')).rejects.toThrow(/default secret path/);
  });

  it('caches a secret for the TTL and refetches after it', async () => {
    const { resolve, fetch, advance } = vault({}, 'root-token', 60);
    await resolve('myapp/db#password');
    await resolve('myapp/db#port');
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(61_000);
    await resolve('myapp/db#password');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache when TTL is 0, nor cache failures', async () => {
    const { resolve, fetch } = vault({}, 'root-token', 0);
    await resolve('myapp/db#password');
    await resolve('myapp/db#password');
    expect(fetch).toHaveBeenCalledTimes(2);

    const cached = vault();
    await expect(cached.resolve('missing/x#y')).rejects.toThrow();
    await expect(cached.resolve('missing/x#y')).rejects.toThrow();
    expect(cached.fetch).toHaveBeenCalledTimes(2);
  });

  it('lets environment variables override address and token', async () => {
    const { resolve, fetch } = vault({ address: '' }, null);
    await expect(resolve('myapp/api_key', { VAULT_ADDR: 'https://staging-vault:8200', VAULT_TOKEN: 'env-token' })).resolves.toBe('key-123');
    expect(fetch.mock.calls[0][0]).toBe('https://staging-vault:8200/v1/secret/data/myapp');
  });

  it('gives actionable errors', async () => {
    const { resolve } = vault();
    await expect(resolve('myapp/db#nope')).rejects.toThrow('Field "nope" not found in secret "secret/myapp/db" (fields: password, port).');
    await expect(resolve('missing/x#y')).rejects.toThrow(/not found/);
    await expect(vault({}, 'bad').resolve('myapp/db#password')).rejects.toThrow(/Permission denied/);
    await expect(vault({ address: '' }).resolve('myapp/db#password')).rejects.toThrow(/no vault address.*VAULT_ADDR/);
    await expect(vault({}, null).resolve('myapp/db#password')).rejects.toThrow(/no token.*VAULT_TOKEN/);
  });

  it('uses the KV v1 path layout', async () => {
    const fetch = fakeFetch(() => json(200, { data: { token: 'v1-value' } }));
    const { resolve } = setup({ provider: 'vault', settings: { address: 'http://127.0.0.1:8200', mount: 'kv', kvVersion: '1' }, secrets: { token: 't' }, fetch });
    await expect(resolve('ci#token')).resolves.toBe('v1-value');
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8200/v1/kv/ci');
  });

  it('describes the token on test', async () => {
    await expect(vault().service.test('vault')).resolves.toEqual({
      summary: 'Connected as token-ci',
      details: ['Token expires in 2 h', 'Policies: default, myapp'],
    });
  });

  it('browses folders, then a secret\'s field names (never values)', async () => {
    const { service } = vault();
    const root = await service.browse('vault');
    expect(root.map((e) => [e.id, e.kind])).toEqual([['list:myapp', 'folder'], ['read:top', 'secret']]);
    expect((await service.browse('vault', 'list:myapp')).map((e) => e.id)).toEqual(['read:myapp/db']);
    const fields = await service.browse('vault', 'read:myapp/db');
    expect(fields).toEqual([
      { id: 'myapp/db#password', label: 'password', kind: 'field', reference: '{{vault.myapp/db#password}}' },
      { id: 'myapp/db#port', label: 'port', kind: 'field', reference: '{{vault.myapp/db#port}}' },
    ]);
    expect(JSON.stringify(fields)).not.toContain('s3cret');
  });

  it('treats an empty folder (404 on LIST) as empty', async () => {
    expect(await vault().service.browse('vault', 'list:nothing')).toEqual([]);
  });
});
