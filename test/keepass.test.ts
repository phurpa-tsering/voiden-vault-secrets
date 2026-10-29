import { describe, expect, it, vi } from 'vitest';
import type { ExecLike } from '../src/http';
import { keepassCliCandidates } from '../src/providers/keepass';
import { setup } from './helpers';

const DB: Record<string, Record<string, string>> = {
  'Dev/GitHub': { Title: 'GitHub', UserName: 'octo', Password: 'gh-pass', URL: 'https://github.com', Notes: 'line 1\nline 2' },
  'Root entry': { Password: 'root-pass' },
};

/** Behaves like keepassxc-cli for the commands the provider uses. */
function fakeCli(password = 'db-pass') {
  return vi.fn<Parameters<ExecLike>, ReturnType<ExecLike>>(async (_file, args, { input }) => {
    const fail = (stderr: string) => ({ code: 1, stdout: '', stderr });
    const usesPassword = !args.includes('--no-password');
    if (usesPassword && input !== `${password}\n`) return fail('Error while reading the database:\nInvalid credentials were provided, please try again.');

    const [command] = args;
    if (command === 'ls') return { code: 0, stdout: 'Dev/\nDev/GitHub\nRoot entry\nRecycle Bin/\nRecycle Bin/Old\n', stderr: '' };

    const entry = args[args.length - 1];
    const attrs = DB[entry];
    if (!attrs) return fail(`Could not find entry with path ${entry}.`);
    if (args.includes('-t')) return entry === 'Dev/GitHub' ? { code: 0, stdout: '654321\n', stderr: '' } : fail(`Entry with path ${entry} has no TOTP set up.`);
    const attr = args[args.indexOf('-a') + 1];
    const value = Object.entries(attrs).find(([k]) => k.toLowerCase() === attr.toLowerCase())?.[1];
    if (value === undefined) return fail(`ERROR: unknown attribute ${attr}.`);
    return { code: 0, stdout: `${value}\n`, stderr: '' };
  });
}

function keepass(settings: Record<string, string> = {}, secrets: Record<string, string> = { password: 'db-pass' }, exec = fakeCli()) {
  return { ...setup({ provider: 'keepass', settings: { databasePath: '~/vault.kdbx', ...settings }, secrets, exec }), exec };
}

describe('keepass provider', () => {
  it('reads the password by default, sending the database password on stdin only', async () => {
    const { resolve, exec } = keepass();
    await expect(resolve('Dev/GitHub')).resolves.toBe('gh-pass');
    const [file, args, opts] = exec.mock.calls[0];
    expect(file).toBe('/bin/keepassxc-cli');
    expect(args).toEqual(['show', '-q', '-s', '-a', 'Password', '/home/me/vault.kdbx', 'Dev/GitHub']);
    expect(args.join(' ')).not.toContain('db-pass');
    expect(opts.input).toBe('db-pass\n');
  });

  it('maps lower-case attribute names and keeps multi-line values', async () => {
    const { resolve } = keepass();
    await expect(resolve('Dev/GitHub#username')).resolves.toBe('octo');
    await expect(resolve('/Dev/GitHub#notes')).resolves.toBe('line 1\nline 2');
  });

  it('reads TOTP fresh each time', async () => {
    const { resolve, exec } = keepass();
    await expect(resolve('Dev/GitHub#totp')).resolves.toBe('654321');
    await resolve('Dev/GitHub#TOTP');
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][1]).toContain('-t');
  });

  it('supports key-file-only databases', async () => {
    const { resolve, exec } = keepass({ keyFilePath: '~/db.key' }, {});
    await resolve('Dev/GitHub');
    expect(exec.mock.calls[0][1]).toEqual(['show', '-q', '-k', '/home/me/db.key', '--no-password', '-s', '-a', 'Password', '/home/me/vault.kdbx', 'Dev/GitHub']);
  });

  it('explains failures', async () => {
    await expect(keepass({}, { password: 'nope' }).resolve('Dev/GitHub')).rejects.toThrow('Wrong KeePassXC database password or key file.');
    await expect(keepass().resolve('Dev/Missing')).rejects.toThrow('KeePassXC entry "Dev/Missing" not found');
    await expect(keepass().resolve('Root entry#totp')).rejects.toThrow('has no TOTP set up');
    await expect(keepass({}, {}).resolve('Dev/GitHub')).rejects.toThrow(/database password or a key file/);
    await expect(keepass({ databasePath: '' }).resolve('Dev/GitHub')).rejects.toThrow(/KeePassXC isn't set up: no database file/);

    const missingCli: ExecLike = async () => {
      throw Object.assign(new Error('spawn keepassxc-cli ENOENT'), { code: 'ENOENT' });
    };
    await expect(keepass({}, undefined, missingCli as any).resolve('Dev/GitHub')).rejects.toThrow(/keepassxc-cli not found/);
  });

  it('tests and browses groups and entries, skipping the recycle bin', async () => {
    const { service } = keepass();
    await expect(service.test('keepass')).resolves.toEqual({ summary: 'Opened vault.kdbx', details: ['2 entries'] });
    const entries = await service.browse('keepass');
    expect(entries.map((e) => [e.label, e.kind])).toEqual([['Dev', 'folder'], ['Root entry', 'secret']]);
    expect(entries[0].children![0].children!.map((c) => c.reference)).toEqual([
      '{{keepass.Dev/GitHub}}',
      '{{keepass.Dev/GitHub#UserName}}',
      '{{keepass.Dev/GitHub#URL}}',
    ]);
  });

  it('knows where KeePassXC installs its CLI', () => {
    expect(keepassCliCandidates('darwin', { HOME: '/Users/me' })[0]).toBe('/Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli');
    expect(keepassCliCandidates('win32', { ProgramFiles: 'C:\\Program Files' })[0]).toBe('C:\\Program Files\\KeePassXC\\keepassxc-cli.exe');
  });
});
