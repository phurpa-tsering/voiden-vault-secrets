import { describe, expect, it } from 'vitest';
import { migrateConfig } from '../src/configModel';
import { fakeFetch, json, setup } from './helpers';

describe('secrets service', () => {
  const fetch = () => fakeFetch((url, init) =>
    init.headers.Authorization === 'Bearer dp.st.draft' || init.headers.Authorization === 'Bearer dp.st.saved'
      ? json(200, { API_KEY: init.headers.Authorization.slice(-5) })
      : json(401, {}),
  );

  it('tests and browses with unsaved draft values', async () => {
    const { service } = setup({ provider: 'doppler', secrets: { token: 'dp.st.saved' }, fetch: fetch() });
    await expect(service.resolve('doppler', 'API_KEY')).resolves.toBe('saved');
    const browse = await service.browse('doppler', undefined, { settings: {}, secrets: { token: 'dp.st.draft' } });
    expect(browse.map((e) => e.label)).toEqual(['API_KEY']);
    // A removed secret in the draft counts as missing.
    await expect(service.test('doppler', { settings: {}, secrets: { token: null } })).rejects.toThrow(/isn't set up/);
  });

  it('never shares cached reads between credentials', async () => {
    const f = fetch();
    const { service } = setup({ provider: 'doppler', secrets: { token: 'dp.st.saved' }, fetch: f });
    await service.resolve('doppler', 'API_KEY');
    await expect(service.resolve('doppler', 'API_KEY', { DOPPLER_TOKEN: 'dp.st.draft' })).resolves.toBe('draft');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('tracks the last status per provider', async () => {
    const { service } = setup({ provider: 'doppler', secrets: { token: 'dp.st.saved' }, fetch: fetch() });
    await service.resolve('doppler', 'API_KEY');
    expect(service.getStatus().doppler).toMatchObject({ ok: true });
    await expect(service.resolve('doppler', 'NOPE')).rejects.toThrow();
    expect(service.getStatus().doppler).toMatchObject({ ok: false, message: expect.stringContaining('NOPE') });
  });
});

describe('migrateConfig', () => {
  it('moves a 1.0.x Vault config into the providers shape', () => {
    const migrated = migrateConfig({
      settings: { address: 'https://vault:8200', namespace: '', mount: 'kv', kvVersion: 1, defaultPath: 'app', cacheTtlSeconds: 30 },
      encryptedToken: 'ZW5j',
    });
    expect(migrated.version).toBe(2);
    expect(migrated.cacheTtlSeconds).toBe(30);
    expect(migrated.providers.vault).toEqual({ address: 'https://vault:8200', mount: 'kv', kvVersion: '1', namespace: '', defaultPath: 'app' });
    expect(migrated.encrypted).toEqual({ 'vault.token': 'ZW5j' });
    expect(migrated.providers.infisical.siteUrl).toBe('https://app.infisical.com');
  });

  it('sanitises a v2 config and drops unknown settings', () => {
    const migrated = migrateConfig({
      version: 2,
      cacheTtlSeconds: -5,
      providers: { doppler: { project: ' api ', token: 'should-not-be-here', bogus: 1 }, vault: { kvVersion: '7' } },
      encrypted: { 'doppler.token': 'eA==' },
    });
    expect(migrated.cacheTtlSeconds).toBe(0);
    expect(migrated.providers.doppler).toEqual({ project: 'api', config: '' });
    expect(migrated.providers.vault.kvVersion).toBe('2');
  });

  it('starts from defaults with nothing saved', () => {
    expect(migrateConfig(undefined).cacheTtlSeconds).toBe(60);
  });
});
