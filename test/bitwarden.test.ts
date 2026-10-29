import { describe, expect, it } from 'vitest';
import { fakeFetch, json, setup } from './helpers';

const ITEMS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'GitHub',
    type: 1,
    notes: 'personal',
    login: { username: 'octo', password: 'gh-pass', totp: 'otpauth://x', uris: [{ uri: 'https://github.com' }] },
    fields: [{ name: 'api_key', value: 'ghp_123' }],
  },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Shared', type: 1, login: { password: 'a' } },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Shared', type: 1, login: { password: 'b' } },
];

function bitwarden(state: { locked?: boolean; running?: boolean } = {}) {
  const fetch = fakeFetch((url, init) => {
    if (state.running === false) throw new Error('connect ECONNREFUSED 127.0.0.1:8087');
    const locked = { success: false, message: 'Vault is locked.' };
    switch (`${init.method} ${url.pathname}`) {
      case 'GET /status':
        return json(200, { success: true, data: { object: 'template', template: { status: state.locked ? 'locked' : 'unlocked', userEmail: 'me@example.com' } } });
      case 'GET /list/object/items':
        return state.locked ? json(400, locked) : json(200, { success: true, data: { object: 'list', data: ITEMS } });
      case 'GET /object/totp/11111111-1111-1111-1111-111111111111':
        return json(200, { success: true, data: { object: 'string', data: '123456' } });
      case 'POST /unlock':
        if (JSON.parse(init.body!).password !== 'master') return json(400, { success: false, message: 'Invalid master password.' });
        state.locked = false;
        return json(200, { success: true, data: { title: 'Your vault is now unlocked!' } });
    }
    return undefined;
  });
  return { ...setup({ provider: 'bitwarden', fetch }), fetch };
}

describe('bitwarden provider', () => {
  it('reads the password by default and other fields by name', async () => {
    const { resolve } = bitwarden();
    await expect(resolve('GitHub')).resolves.toBe('gh-pass');
    await expect(resolve('github#username')).resolves.toBe('octo');
    await expect(resolve('GitHub#url')).resolves.toBe('https://github.com');
    await expect(resolve('GitHub#notes')).resolves.toBe('personal');
    await expect(resolve('GitHub#api_key')).resolves.toBe('ghp_123');
    await expect(resolve('11111111-1111-1111-1111-111111111111#password')).resolves.toBe('gh-pass');
  });

  it('fetches TOTP codes fresh', async () => {
    const { resolve, fetch } = bitwarden();
    await expect(resolve('GitHub#totp')).resolves.toBe('123456');
    await resolve('GitHub#totp');
    expect(fetch.mock.calls.filter(([url]) => url.includes('/object/totp/'))).toHaveLength(2);
  });

  it('explains ambiguous names, missing items and fields', async () => {
    const { resolve } = bitwarden();
    await expect(resolve('Shared')).rejects.toThrow(/2 Bitwarden items are named "Shared" — use the item id/);
    await expect(resolve('Nope')).rejects.toThrow(/No Bitwarden item named "Nope"/);
    await expect(resolve('GitHub#pin')).rejects.toThrow('has no field "pin" (fields: username, password, uri, totp, notes, api_key).');
  });

  it('reports a locked vault and unlocks it', async () => {
    const { service, resolve } = bitwarden({ locked: true });
    await expect(resolve('GitHub')).rejects.toMatchObject({ code: 'locked' });
    await expect(service.test('bitwarden')).rejects.toMatchObject({ code: 'locked' });
    await expect(service.action('bitwarden', 'unlock', 'wrong')).rejects.toThrow('Invalid master password.');
    await expect(service.action('bitwarden', 'unlock', 'master')).resolves.toBe('Bitwarden unlocked');
    await expect(resolve('GitHub')).resolves.toBe('gh-pass');
  });

  it('says how to start bw serve when it is not running', async () => {
    await expect(bitwarden({ running: false }).resolve('GitHub')).rejects.toThrow(/Can't reach bw serve.*bw serve --port 8087/);
  });

  it('browses items with fields, using ids for duplicate names and no values', async () => {
    const { service } = bitwarden();
    await expect(service.test('bitwarden')).resolves.toMatchObject({ summary: 'Unlocked as me@example.com' });
    const entries = await service.browse('bitwarden');
    const github = entries.find((e) => e.label === 'GitHub')!;
    expect(github.children!.map((c) => c.reference)).toEqual([
      '{{bitwarden.GitHub#username}}',
      '{{bitwarden.GitHub}}',
      '{{bitwarden.GitHub#uri}}',
      '{{bitwarden.GitHub#totp}}',
      '{{bitwarden.GitHub#notes}}',
      '{{bitwarden.GitHub#api_key}}',
    ]);
    const shared = entries.filter((e) => e.label === 'Shared');
    expect(shared[0].children![0].reference).toMatch(/^\{\{bitwarden\.[0-9a-f-]{36}\}\}$/);
    expect(JSON.stringify(entries)).not.toMatch(/gh-pass|ghp_123/);
  });
});
