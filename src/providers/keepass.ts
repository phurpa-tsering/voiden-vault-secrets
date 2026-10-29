/**
 * KeePassXC, through its `keepassxc-cli` tool. The database password goes to
 * the CLI on stdin, never on the command line.
 *
 *   keepassxc-cli show -q -s -a <attr> <db> <entry>   read one attribute
 *   keepassxc-cli show -q -t <db> <entry>             current TOTP
 *   keepassxc-cli ls -q -R -f <db>                    list entries (browse, test)
 */

import { SecretError } from '../http';
import { parseItemReference, trimSlashes } from '../reference';
import type { BrowseEntry } from '../types';
import type { Provider, ProviderContext } from './types';

const CLI_TIMEOUT_MS = 20_000;

/** Where KeePassXC installs its CLI; the first that exists wins, else PATH. */
export function keepassCliCandidates(platform: string, env: Record<string, string | undefined>): string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli',
      `${env.HOME ?? ''}/Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli`,
      '/opt/homebrew/bin/keepassxc-cli',
      '/usr/local/bin/keepassxc-cli',
    ];
  }
  if (platform === 'win32') {
    return [
      `${env.ProgramFiles ?? 'C:\\Program Files'}\\KeePassXC\\keepassxc-cli.exe`,
      `${env.LOCALAPPDATA ?? ''}\\Programs\\KeePassXC\\keepassxc-cli.exe`,
    ];
  }
  return ['/usr/bin/keepassxc-cli', '/usr/local/bin/keepassxc-cli', '/snap/bin/keepassxc.cli'];
}

// Lower-case shorthands for KeePass's standard attributes.
const ATTRIBUTES: Record<string, string> = {
  password: 'Password',
  username: 'UserName',
  user: 'UserName',
  url: 'URL',
  notes: 'Notes',
  title: 'Title',
};

function describeFailure(stderr: string, entry?: string): string {
  const text = stderr.trim();
  if (/invalid credentials|wrong key|HMAC mismatch/i.test(text)) return 'Wrong KeePassXC database password or key file.';
  if (/could not find entry/i.test(text)) return `KeePassXC entry "${entry}" not found — use its full path, e.g. Group/Entry.`;
  if (/has no TOTP/i.test(text)) return `KeePassXC entry "${entry}" has no TOTP set up.`;
  if (/ambiguous/i.test(text)) return `KeePassXC: ${text.split('\n')[0]}`;
  if (/no such file|failed to open|doesn't exist|does not exist/i.test(text)) return `KeePassXC couldn't open the database (${text.split('\n')[0]}).`;
  return `keepassxc-cli failed${text ? `: ${text.split('\n')[0]}` : '.'}`;
}

export interface KeepassDeps {
  /** Absolute path of the bundled/installed CLI, or "keepassxc-cli" to use PATH. */
  findCli(): string;
  /** Expand "~" and make the path absolute. */
  expandPath(path: string): string;
}

export function createKeepassProvider(deps: KeepassDeps): Provider {
  function databaseArgs(ctx: ProviderContext): string[] {
    const { password, keyFilePath } = ctx.config;
    if (!password && !keyFilePath) {
      throw new SecretError('Set the KeePassXC database password or a key file in Vault Secrets settings.');
    }
    return [...(keyFilePath ? ['-k', deps.expandPath(keyFilePath)] : []), ...(password ? [] : ['--no-password'])];
  }

  async function run(ctx: ProviderContext, command: string, flags: string[], entry?: string): Promise<string> {
    const cli = ctx.config.cliPath ? deps.expandPath(ctx.config.cliPath) : deps.findCli();
    const args = [command, '-q', ...databaseArgs(ctx), ...flags, deps.expandPath(ctx.config.databasePath), ...(entry !== undefined ? [entry] : [])];
    let result;
    try {
      result = await ctx.exec(cli, args, { input: ctx.config.password ? `${ctx.config.password}\n` : '', timeoutMs: CLI_TIMEOUT_MS });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new SecretError('keepassxc-cli not found — install KeePassXC, or set the path to keepassxc-cli in Vault Secrets settings.');
      }
      throw new SecretError(`Couldn't run keepassxc-cli (${error?.message ?? error}).`);
    }
    if (result.code !== 0) throw new SecretError(describeFailure(result.stderr || result.stdout, entry));
    return result.stdout;
  }

  /** Entry paths, without groups or the recycle bin. */
  const listEntries = (ctx: ProviderContext) =>
    ctx.cached(['ls'], async () =>
      (await run(ctx, 'ls', ['-R', '-f']))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.endsWith('/') && !/^Recycle Bin\//.test(line) && line !== '[empty]'),
    );

  return {
    async resolve(key, ctx) {
      const ref = parseItemReference('keepass', key, 'Password');
      const entry = trimSlashes(ref.item);
      if (ref.field.toLowerCase() === 'totp') {
        // Time-based, so never cached.
        return (await run(ctx, 'show', ['-t'], entry)).trim();
      }
      const attribute = ATTRIBUTES[ref.field.toLowerCase()] ?? ref.field;
      const output = await ctx.cached(['show', entry, attribute], () => run(ctx, 'show', ['-s', '-a', attribute], entry));
      return output.replace(/\r?\n$/, '');
    },

    async test(ctx) {
      const entries = await listEntries(ctx);
      const file = ctx.config.databasePath.split(/[\\/]/).pop();
      return { summary: `Opened ${file}`, details: [`${entries.length} entries`] };
    },

    async browse(ctx) {
      const entries = await listEntries(ctx);
      const root: BrowseEntry[] = [];
      const groups = new Map<string, BrowseEntry>();

      const groupFor = (path: string): BrowseEntry[] => {
        if (!path) return root;
        let group = groups.get(path);
        if (!group) {
          const slash = path.lastIndexOf('/');
          group = { id: `group:${path}`, label: path.slice(slash + 1), kind: 'folder', children: [] };
          groups.set(path, group);
          groupFor(slash === -1 ? '' : path.slice(0, slash)).push(group);
        }
        return group.children!;
      };

      for (const entry of entries) {
        const slash = entry.lastIndexOf('/');
        const fields = ['Password', 'UserName', 'URL'].map((attr) => ({
          id: `${entry}#${attr}`,
          label: attr,
          kind: 'field' as const,
          reference: attr === 'Password' ? `{{keepass.${entry}}}` : `{{keepass.${entry}#${attr}}}`,
        }));
        groupFor(slash === -1 ? '' : entry.slice(0, slash)).push({
          id: `entry:${entry}`,
          label: entry.slice(slash + 1),
          kind: 'secret',
          children: fields,
        });
      }
      return root;
    },
  };
}
