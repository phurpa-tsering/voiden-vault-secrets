/**
 * Bitwarden password manager, through the CLI's local REST API (`bw serve`).
 * The user logs in with `bw login` and runs `bw serve`; this provider reads
 * items from it and can unlock / lock / sync it.
 *
 *   GET  /status                          locked / unlocked / unauthenticated
 *   GET  /list/object/items[?search=]     find items by name
 *   GET  /object/item/<id>                read one item
 *   GET  /object/totp/<id>                current TOTP code
 *   POST /unlock {password} · /lock · /sync
 */

import { baseUrl, requestJson, SecretError } from '../http';
import { parseItemReference } from '../reference';
import type { BrowseEntry } from '../types';
import type { Provider, ProviderContext } from './types';

export const BW_SERVE_DEFAULT = 'http://localhost:8087';

interface BwItem {
  id: string;
  name: string;
  type: number;
  notes?: string | null;
  login?: { username?: string | null; password?: string | null; totp?: string | null; uris?: { uri?: string | null }[] | null } | null;
  card?: { number?: string | null; code?: string | null; cardholderName?: string | null } | null;
  fields?: { name?: string | null; value?: string | null }[] | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOCKED_MESSAGE = 'Bitwarden is locked — unlock it in Vault Secrets settings, or run `bw unlock`.';

/** bw serve answers {success, message, data}; a locked vault is a 400 "Vault is locked." */
function describeError(status: number, body: any): string {
  const message = typeof body?.message === 'string' ? body.message : '';
  if (/locked/i.test(message)) return LOCKED_MESSAGE;
  if (status === 404) return message || 'Not found in Bitwarden.';
  return message ? `Bitwarden: ${message}` : `bw serve returned HTTP ${status}.`;
}

async function bw(ctx: ProviderContext, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const url = `${baseUrl(ctx.config.serverUrl || BW_SERVE_DEFAULT, 'bw serve address')}${path}`;
  let body;
  try {
    body = await requestJson(ctx.fetch, url, init, 'bw serve', describeError);
  } catch (error) {
    if (error instanceof SecretError && error.message.startsWith("Can't reach")) {
      throw new SecretError(`${error.message} Start it with \`bw serve --port 8087\` and keep it running.`, undefined, 'unreachable');
    }
    if (error instanceof SecretError && error.message === LOCKED_MESSAGE) throw new SecretError(LOCKED_MESSAGE, error.status, 'locked');
    throw error;
  }
  if (body?.success === false) {
    const message = describeError(400, body);
    throw new SecretError(message, undefined, message === LOCKED_MESSAGE ? 'locked' : undefined);
  }
  return body?.data;
}

const listItems = (ctx: ProviderContext): Promise<BwItem[]> =>
  ctx.cached(['items'], async () => {
    const data = await bw(ctx, '/list/object/items');
    return Array.isArray(data?.data) ? data.data : [];
  });

async function findItem(ctx: ProviderContext, nameOrId: string): Promise<BwItem> {
  const items = await listItems(ctx);
  if (UUID.test(nameOrId)) {
    const byId = items.find((i) => i.id === nameOrId);
    if (byId) return byId;
  }
  let matches = items.filter((i) => i.name === nameOrId);
  if (!matches.length) matches = items.filter((i) => i.name?.toLowerCase() === nameOrId.toLowerCase());
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new SecretError(`No Bitwarden item named "${nameOrId}" (run Sync if you added it recently).`);
  throw new SecretError(
    `${matches.length} Bitwarden items are named "${nameOrId}" — use the item id instead, e.g. {{bitwarden.${matches[0].id}#password}}.`,
  );
}

/** Named fields every item type may have, plus its custom fields. */
function fieldsOf(item: BwItem): Record<string, string | null | undefined> {
  const out: Record<string, string | null | undefined> = {};
  if (item.login) {
    out.username = item.login.username;
    out.password = item.login.password;
    out.uri = item.login.uris?.[0]?.uri;
    if (item.login.totp) out.totp = item.login.totp;
  }
  if (item.card) {
    out.number = item.card.number;
    out.code = item.card.code;
    out.cardholder = item.card.cardholderName;
  }
  if (item.notes) out.notes = item.notes;
  for (const f of item.fields ?? []) if (f?.name) out[f.name] = f.value;
  return out;
}

const ALIASES: Record<string, string> = { user: 'username', pass: 'password', url: 'uri', note: 'notes' };

export const bitwardenProvider: Provider = {
  async resolve(key, ctx) {
    const { item: itemName, field } = parseItemReference('bitwarden', key, 'password');
    const item = await findItem(ctx, itemName);
    const fields = fieldsOf(item);

    const wanted = ALIASES[field.toLowerCase()] ?? field;
    const name = wanted in fields ? wanted : Object.keys(fields).find((k) => k.toLowerCase() === wanted.toLowerCase());
    if (!name) {
      const available = Object.keys(fields).filter((k) => fields[k]);
      throw new SecretError(`Bitwarden item "${item.name}" has no field "${field}"` + (available.length ? ` (fields: ${available.join(', ')}).` : '.'));
    }
    if (name === 'totp') {
      // Time-based, so never cached.
      const totp = await bw(ctx, `/object/totp/${encodeURIComponent(item.id)}`);
      return String(totp?.data ?? '');
    }
    const value = fields[name];
    if (value === null || value === undefined || value === '') throw new SecretError(`Bitwarden item "${item.name}" has an empty ${name}.`);
    return value;
  },

  async test(ctx) {
    const status = (await bw(ctx, '/status'))?.template ?? {};
    if (status.status === 'locked') throw new SecretError(LOCKED_MESSAGE, undefined, 'locked');
    if (status.status === 'unauthenticated') throw new SecretError('bw serve is running but not logged in — run `bw login` first.');
    const items = await listItems(ctx);
    return {
      summary: `Unlocked${status.userEmail ? ` as ${status.userEmail}` : ''}`,
      details: [
        `${items.length} items`,
        ...(status.serverUrl ? [`Server: ${status.serverUrl}`] : []),
        ...(status.lastSync ? [`Last sync: ${new Date(status.lastSync).toLocaleString()}`] : []),
      ],
    };
  },

  async browse(ctx) {
    const items = await listItems(ctx);
    const nameCounts = new Map<string, number>();
    for (const i of items) nameCounts.set(i.name, (nameCounts.get(i.name) ?? 0) + 1);

    return items
      .map((item): BrowseEntry => {
        // Duplicate names can't be referenced by name, so fall back to the id.
        const handle = nameCounts.get(item.name) === 1 && !/[#{}]/.test(item.name) ? item.name : item.id;
        const fields = fieldsOf(item);
        return {
          id: item.id,
          label: item.name,
          kind: 'secret',
          detail: item.login?.username || undefined,
          children: Object.keys(fields)
            .filter((f) => fields[f])
            .map((f) => ({
              id: `${item.id}#${f}`,
              label: f,
              kind: 'field' as const,
              reference: f === 'password' ? `{{bitwarden.${handle}}}` : `{{bitwarden.${handle}#${f}}}`,
            })),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  actions: {
    async unlock(ctx, password) {
      if (!password) throw new SecretError('Enter your master password.');
      await bw(ctx, '/unlock', { method: 'POST', body: { password } });
      return 'Bitwarden unlocked';
    },
    async lock(ctx) {
      await bw(ctx, '/lock', { method: 'POST' });
      return 'Bitwarden locked';
    },
    async sync(ctx) {
      await bw(ctx, '/sync', { method: 'POST' });
      return 'Bitwarden synced';
    },
  },
};
