/**
 * HashiCorp Vault — KV v1/v2 reads, listing and token lookup.
 *
 *   GET  /v1/<mount>/data/<path>        read (KV v2)   · /v1/<mount>/<path> (KV v1)
 *   LIST /v1/<mount>/metadata/<path>    browse (KV v2) · /v1/<mount>/<path> (KV v1)
 *   GET  /v1/auth/token/lookup-self     test connection
 */

import { baseUrl, requestJson, SecretError } from '../http';
import { parseReference, pickField, trimSlashes } from '../reference';
import type { BrowseEntry } from '../types';
import type { Provider, ProviderContext } from './types';

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function mountOf(ctx: ProviderContext) {
  return trimSlashes(ctx.config.mount ?? '') || 'secret';
}

const isV1 = (ctx: ProviderContext) => ctx.config.kvVersion === '1';

function vaultGet(ctx: ProviderContext, apiPath: string, what: string): Promise<any> {
  const { address, token, namespace } = ctx.config;
  const headers: Record<string, string> = { 'X-Vault-Token': token };
  if (namespace?.trim()) headers['X-Vault-Namespace'] = namespace.trim();

  return requestJson(ctx.fetch, `${baseUrl(address, 'Vault address')}/v1/${apiPath}`, { headers }, 'Vault', (status) => {
    switch (status) {
      case 401:
      case 403:
        return `Permission denied reading ${what} — check that the token is valid and its policy allows read.`;
      case 404:
        return `${what} not found.`;
      case 503:
        return 'Vault is sealed or unavailable.';
      default:
        return `Vault returned HTTP ${status} for ${what}.`;
    }
  });
}

function readSecret(ctx: ProviderContext, path: string): Promise<Record<string, unknown>> {
  const m = mountOf(ctx);
  return ctx.cached(['read', m, ctx.config.kvVersion, path], async () => {
    const apiPath = isV1(ctx) ? `${encodePath(m)}/${encodePath(path)}` : `${encodePath(m)}/data/${encodePath(path)}`;
    const body = await vaultGet(ctx, apiPath, `secret "${m}/${path}"`);
    const data = isV1(ctx) ? body?.data : body?.data?.data;
    if (!data || typeof data !== 'object') {
      throw new SecretError(`Secret "${m}/${path}" has no data${isV1(ctx) ? '' : ' (deleted, or is the mount KV v1?)'}.`);
    }
    return data;
  });
}

async function listKeys(ctx: ProviderContext, folder: string): Promise<string[]> {
  const m = mountOf(ctx);
  const prefix = folder ? `${encodePath(folder)}/` : '';
  const apiPath = isV1(ctx) ? `${encodePath(m)}/${prefix}?list=true` : `${encodePath(m)}/metadata/${prefix}?list=true`;
  try {
    const body = await vaultGet(ctx, apiPath, `folder "${m}/${folder}"`);
    return Array.isArray(body?.data?.keys) ? body.data.keys : [];
  } catch (error) {
    // Vault answers an empty folder with 404.
    if (error instanceof SecretError && error.status === 404) return [];
    throw error;
  }
}

function formatTtl(seconds: number): string {
  if (!seconds) return 'never expires';
  if (seconds < 3600) return `expires in ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `expires in ${Math.round(seconds / 3600)} h`;
  return `expires in ${Math.round(seconds / 86400)} days`;
}

export const vaultProvider: Provider = {
  async resolve(key, ctx) {
    const ref = parseReference('vault', key);
    const path = ref.path || trimSlashes(ctx.config.defaultPath ?? '');
    if (!path) {
      throw new SecretError(
        `"{{vault.${key.trim()}}}" has no secret path. Use {{vault.path#${ref.field}}} or set a default secret path in Vault Secrets settings.`,
      );
    }
    const data = await readSecret(ctx, path);
    return pickField(data, ref.field, `secret "${mountOf(ctx)}/${path}"`);
  },

  async test(ctx) {
    const body = await vaultGet(ctx, 'auth/token/lookup-self', 'token info');
    const name = body?.data?.display_name ?? '';
    const policies: string[] = Array.isArray(body?.data?.policies) ? body.data.policies : [];
    const ttl = typeof body?.data?.ttl === 'number' ? body.data.ttl : 0;
    return {
      summary: name ? `Connected as ${name}` : 'Connected',
      details: [`Token ${formatTtl(ttl)}`, ...(policies.length ? [`Policies: ${policies.join(', ')}`] : [])],
    };
  },

  // Entry ids: "list:<folder>" for folders, "read:<path>" for secrets.
  async browse(ctx, parent) {
    if (parent?.startsWith('read:')) {
      const path = parent.slice('read:'.length);
      const data = await readSecret(ctx, path);
      return Object.keys(data).map((field) => ({
        id: `${path}#${field}`,
        label: field,
        kind: 'field' as const,
        reference: `{{vault.${path}#${field}}}`,
      }));
    }

    const folder = parent?.startsWith('list:') ? parent.slice('list:'.length) : '';
    const keys = await listKeys(ctx, folder);
    return keys
      .map((k): BrowseEntry => {
        const full = folder ? `${folder}/${trimSlashes(k)}` : trimSlashes(k);
        return k.endsWith('/')
          ? { id: `list:${full}`, label: trimSlashes(k), kind: 'folder', lazy: true }
          : { id: `read:${full}`, label: k, kind: 'secret', lazy: true };
      })
      .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'folder' ? -1 : 1));
  },
};
