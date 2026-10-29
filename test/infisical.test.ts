import { describe, expect, it } from 'vitest';
import { fakeFetch, json, setup } from './helpers';

const FOLDERS: Record<string, Record<string, { key: string; value: string }[]>> = {
  dev: {
    '/': [{ key: 'API_KEY', value: 'dev-api' }],
    '/payments': [{ key: 'STRIPE_KEY', value: 'sk_test' }],
  },
  prod: { '/': [{ key: 'API_KEY', value: 'prod-api' }] },
};

function infisical(settings: Record<string, string> = {}, secrets: Record<string, string> = { clientSecret: 'cs' }) {
  let logins = 0;
  const fetch = fakeFetch((url, init) => {
    if (url.pathname === '/api/v1/auth/universal-auth/login') {
      const body = JSON.parse(init.body!);
      if (body.clientId !== 'cid' || body.clientSecret !== 'cs') return json(401, { message: 'Invalid credentials' });
      logins++;
      return json(200, { accessToken: `at-${logins}`, expiresIn: 600, tokenType: 'Bearer' });
    }
    if (url.pathname !== '/api/v3/secrets/raw') return undefined;
    if (!/^Bearer (at-\d+|static-token)$/.test(init.headers.Authorization)) return json(401, { message: 'Token invalid' });
    if (url.searchParams.get('workspaceId') !== 'proj-1') return json(404, { message: 'Project not found' });
    const env = FOLDERS[url.searchParams.get('environment')!] ?? {};
    const path = url.searchParams.get('secretPath')!;
    const recursive = url.searchParams.get('recursive') === 'true';
    const folders = recursive ? Object.keys(env).filter((f) => f.startsWith(path)) : [path];
    const list = folders.flatMap((f) => (env[f] ?? []).map((s) => ({ secretKey: s.key, secretValue: s.value, secretPath: f })));
    return json(200, { secrets: list, imports: [] });
  });
  const ctx = setup({ provider: 'infisical', settings: { clientId: 'cid', projectId: 'proj-1', ...settings }, secrets, fetch });
  return { ...ctx, fetch, logins: () => logins };
}

describe('infisical provider', () => {
  it('logs in with Universal Auth and reads from the default folder', async () => {
    const { resolve, fetch } = infisical();
    await expect(resolve('API_KEY')).resolves.toBe('dev-api');
    expect(fetch.mock.calls[0][0]).toBe('https://app.infisical.com/api/v1/auth/universal-auth/login');
    const listUrl = new URL(fetch.mock.calls[1][0]);
    expect(Object.fromEntries(listUrl.searchParams)).toMatchObject({ workspaceId: 'proj-1', environment: 'dev', secretPath: '/' });
  });

  it('reuses the access token until it expires', async () => {
    const { resolve, advance, logins } = infisical();
    await resolve('API_KEY');
    advance(61_000); // past the secret cache, not the token
    await resolve('API_KEY');
    expect(logins()).toBe(1);
    advance(600_000);
    await resolve('API_KEY');
    expect(logins()).toBe(2);
  });

  it('reads folders from the reference and environments from INFISICAL_ENVIRONMENT', async () => {
    const { resolve } = infisical();
    await expect(resolve('payments/STRIPE_KEY')).resolves.toBe('sk_test');
    await expect(resolve('API_KEY', { INFISICAL_ENVIRONMENT: 'prod' })).resolves.toBe('prod-api');
    await expect(infisical({ secretPath: '/payments' }).resolve('/API_KEY')).resolves.toBe('dev-api');
  });

  it('supports a plain access token', async () => {
    const { resolve, fetch } = infisical({ authMethod: 'token' }, { accessToken: 'static-token' });
    await expect(resolve('API_KEY')).resolves.toBe('dev-api');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('explains failures', async () => {
    await expect(infisical().resolve('NOPE')).rejects.toThrow('Secret "NOPE" not found in Infisical dev:/');
    await expect(infisical({}, { clientSecret: 'wrong' }).resolve('API_KEY')).rejects.toThrow(/rejected the client ID or secret/);
    await expect(infisical({ projectId: 'other' }).resolve('API_KEY')).rejects.toThrow('Project not found');
    await expect(infisical({ projectId: '' }).resolve('API_KEY')).rejects.toThrow(/no project id.*INFISICAL_PROJECT_ID/);
    // The access token field is only required for the token method.
    await expect(infisical({ authMethod: 'token' }, {}).resolve('API_KEY')).rejects.toThrow(/no access token/);
  });

  it('browses all folders with references relative to the default folder', async () => {
    const entries = await infisical({ secretPath: '/payments' }).service.browse('infisical');
    const refs = entries.flatMap((f) => f.children!.map((c) => c.reference));
    expect(refs).toEqual(['{{infisical./API_KEY}}', '{{infisical.STRIPE_KEY}}']);
  });
});
