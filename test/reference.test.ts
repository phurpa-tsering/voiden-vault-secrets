import { describe, expect, it } from 'vitest';
import { parseReference } from '../src/reference';

describe('parseReference', () => {
  it('splits on # for an explicit field', () => {
    expect(parseReference('myapp/db#password', '')).toEqual({ path: 'myapp/db', field: 'password' });
    expect(parseReference(' /myapp/db/ # password ', '')).toEqual({ path: 'myapp/db', field: 'password' });
  });

  it('uses the last path segment as the field without #', () => {
    expect(parseReference('myapp/db_password', '')).toEqual({ path: 'myapp', field: 'db_password' });
    expect(parseReference('team/myapp/api_key', '')).toEqual({ path: 'team/myapp', field: 'api_key' });
  });

  it('reads bare names from the default path', () => {
    expect(parseReference('api_token', '/myapp/dev/')).toEqual({ path: 'myapp/dev', field: 'api_token' });
  });

  it('explains what to do when a bare name has no default path', () => {
    expect(() => parseReference('api_token', '')).toThrow(/default secret path/);
  });

  it('rejects empty and incomplete references', () => {
    expect(() => parseReference('', 'x')).toThrow(/Empty/);
    expect(() => parseReference('#field', '')).toThrow(/Invalid/);
    expect(() => parseReference('path#', '')).toThrow(/Invalid/);
  });
});
