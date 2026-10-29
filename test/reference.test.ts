import { describe, expect, it } from 'vitest';
import { parseItemReference, parseReference, pickField } from '../src/reference';

describe('parseReference', () => {
  it('splits on # for an explicit field', () => {
    expect(parseReference('vault', 'myapp/db#password')).toEqual({ path: 'myapp/db', field: 'password' });
    expect(parseReference('vault', ' /myapp/db/ # password ')).toEqual({ path: 'myapp/db', field: 'password' });
  });

  it('uses the last path segment as the field without #', () => {
    expect(parseReference('vault', 'myapp/db_password')).toEqual({ path: 'myapp', field: 'db_password' });
    expect(parseReference('vault', 'team/myapp/api_key')).toEqual({ path: 'team/myapp', field: 'api_key' });
  });

  it('leaves the path empty for a bare name, so the provider default applies', () => {
    expect(parseReference('doppler', 'API_KEY')).toEqual({ path: '', field: 'API_KEY' });
  });

  it('rejects empty and incomplete references, naming the namespace', () => {
    expect(() => parseReference('vault', '')).toThrow(/Empty/);
    expect(() => parseReference('vault', '#field')).toThrow('{{vault.path#field}}');
    expect(() => parseReference('infisical', 'path#')).toThrow('{{infisical.path#field}}');
  });
});

describe('parseItemReference', () => {
  it('keeps slashes in item names and defaults the field', () => {
    expect(parseItemReference('keepass', 'Dev/GitHub', 'Password')).toEqual({ item: 'Dev/GitHub', field: 'Password' });
    expect(parseItemReference('keepass', 'Dev/GitHub#UserName', 'Password')).toEqual({ item: 'Dev/GitHub', field: 'UserName' });
    expect(parseItemReference('bitwarden', 'My API key # token ', 'password')).toEqual({ item: 'My API key', field: 'token' });
  });

  it('rejects a missing item or field', () => {
    expect(() => parseItemReference('bitwarden', '#password', 'password')).toThrow(/Invalid/);
    expect(() => parseItemReference('bitwarden', 'GitHub#', 'password')).toThrow(/Invalid/);
  });
});

describe('pickField', () => {
  it('stringifies non-string values and lists fields when missing', () => {
    expect(pickField({ port: 5432 }, 'port', 'x')).toBe('5432');
    expect(() => pickField({ a: 1, b: 2 }, 'c', 'secret "s"')).toThrow('Field "c" not found in secret "s" (fields: a, b).');
  });
});
