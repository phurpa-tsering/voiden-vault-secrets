import { describe, expect, it } from 'vitest';
import { fakeFetch, json, setup } from './helpers';

const CONFIGS: Record<string, Record<string, string>> = {
  'backend/dev': { API_KEY: 'dev-key', DB_URL: 'postgres://dev', DOPPLER_PROJECT: 'backend', DOPPLER_CONFIG: 'dev' },
  'backend/prd': { API_KEY: 'prd-key', DOPPLER_PROJECT: 'backend', DOPPLER_CONFIG: 'prd' },
};

function doppler(settings: Record<string, string> = {}, token = 'dp.st.dev') {
  const fetch = fakeFetch((url, init) => {
    const auth = init.headers.Authorization;
    if (!auth?.startsWith('Bearer dp.')) return json(401, { messages: ['Invalid Auth token'], success: false });
    if (url.pathname === '/v3/me') return json(200, { name: 'voiden-dev', workplace: { name: 'Acme' } });
    if (url.pathname !== '/v3/configs/config/secrets/download') return undefined;
    expect(url.searchParams.get('format')).toBe('json');
    // A service token knows its own config.
    const project = url.searchParams.get('project') ?? 'backend';
    const config = url.searchParams.get('config') ?? (auth === 'Bearer dp.st.dev' ? 'dev' : '');
    const data = CONFIGS[`${project}/${config}`];
    return data ? json(200, data) : json(404, { messages: ['Could not find requested config'], success: false });
  });
  return { ...setup({ provider: 'doppler', settings, secrets: token ? { token } : {}, fetch }), fetch };
}

describe('doppler provider', () => {
  it('reads from the service token\'s config without project/config', async () => {
    const { resolve, fetch } = doppler();
    await expect(resolve('API_KEY')).resolves.toBe('dev-key');
    expect(fetch.mock.calls[0][0]).toBe('https://api.doppler.com/v3/configs/config/secrets/download?format=json');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer dp.st.dev');
  });

  it('downloads a config once for several references', async () => {
    const { resolve, fetch } = doppler();
    await resolve('API_KEY');
    await resolve('DB_URL');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('selects config and project from the reference path', async () => {
    const { resolve, fetch } = doppler({ project: 'backend' });
    await expect(resolve('prd/API_KEY')).resolves.toBe('prd-key');
    await expect(resolve('backend/prd#API_KEY')).resolves.toBe('prd-key');
    expect(fetch.mock.calls[0][0]).toContain('project=backend&config=prd');
    await expect(resolve('a/b/c/API_KEY')).rejects.toThrow(/isn't a Doppler config/);
  });

  it('honours DOPPLER_CONFIG from the environment', async () => {
    await expect(doppler({ project: 'backend' }).resolve('API_KEY', { DOPPLER_CONFIG: 'prd' })).resolves.toBe('prd-key');
  });

  it('explains failures', async () => {
    await expect(doppler().resolve('NOPE')).rejects.toThrow('Secret "NOPE" not found in Doppler');
    await expect(doppler({}, 'bad').resolve('API_KEY')).rejects.toThrow(/rejected the token \(Invalid Auth token\)/);
    await expect(doppler({ project: 'backend', config: 'stg' }).resolve('API_KEY')).rejects.toThrow('Could not find requested config');
    await expect(doppler({}, '').resolve('API_KEY')).rejects.toThrow(/Doppler isn't set up: no token.*DOPPLER_TOKEN/);
  });

  it('tests and browses names only', async () => {
    const { service } = doppler();
    await expect(service.test('doppler')).resolves.toEqual({
      summary: 'Connected to backend/dev',
      details: ['4 secrets readable', 'Token: voiden-dev (Acme)'],
    });
    const entries = await service.browse('doppler');
    expect(entries.map((e) => e.reference)).toContain('{{doppler.API_KEY}}');
    expect(JSON.stringify(entries)).not.toContain('dev-key');
  });
});
