/**
 * Infisical — reads a folder's secrets (with imports) in one call.
 *
 *   POST /api/v1/auth/universal-auth/login   machine identity → access token
 *   GET  /api/v3/secrets/raw?workspaceId=&environment=&secretPath=
 */

import { baseUrl, requestJson, SecretError } from '../http';
import { parseReference, trimSlashes } from '../reference';
import type { BrowseEntry } from '../types';
import type { Provider, ProviderContext } from './types';

export const INFISICAL_CLOUD = 'https://app.infisical.com';

interface RawSecret {
  secretKey: string;
  secretValue: string;
  secretPath?: string;
}

function describeError(status: number, body: any): string {
  const detail = typeof body?.message === 'string' ? body.message : '';
  switch (status) {
    case 401:
      return `Infisical rejected the credentials${detail ? ` (${detail})` : ''}.`;
    case 403:
      return `The identity can't read this project or environment${detail ? ` (${detail})` : ''} — check its project role.`;
    case 404:
      return detail || 'Infisical project, environment or folder not found.';
    default:
      return detail ? `Infisical: ${detail}` : `Infisical returned HTTP ${status}.`;
  }
}

const folderOf = (path: string) => `/${trimSlashes(path)}`;

export function createInfisicalProvider(now: () => number = Date.now): Provider {
  // Universal Auth access tokens, reused until shortly before they expire.
  const logins = new Map<string, { token: string; expiresAt: number }>();

  const site = (ctx: ProviderContext) => baseUrl(ctx.config.siteUrl || INFISICAL_CLOUD, 'Infisical URL');

  async function accessToken(ctx: ProviderContext): Promise<string> {
    if (ctx.config.authMethod === 'token') return ctx.config.accessToken;

    const key = [site(ctx), ctx.config.clientId, ctx.config.clientSecret].join('\u0000');
    const hit = logins.get(key);
    if (hit && hit.expiresAt > now()) return hit.token;

    const body = await requestJson(
      ctx.fetch,
      `${site(ctx)}/api/v1/auth/universal-auth/login`,
      { method: 'POST', body: { clientId: ctx.config.clientId, clientSecret: ctx.config.clientSecret } },
      'Infisical',
      (status, errorBody) =>
        status === 401 || status === 400 || status === 404
          ? 'Infisical rejected the client ID or secret — check the machine identity\'s Universal Auth credentials.'
          : describeError(status, errorBody),
    );
    if (!body?.accessToken) throw new SecretError('Infisical login returned no access token.');
    const ttl = typeof body.expiresIn === 'number' ? body.expiresIn : 300;
    logins.set(key, { token: body.accessToken, expiresAt: now() + Math.max(0, ttl - 30) * 1000 });
    return body.accessToken;
  }

  async function listSecrets(ctx: ProviderContext, folder: string, recursive = false): Promise<RawSecret[]> {
    return ctx.cached(['list', folder, String(recursive)], async () => {
      const params = new URLSearchParams({
        workspaceId: ctx.config.projectId,
        environment: ctx.config.environment || 'dev',
        secretPath: folder,
        expandSecretReferences: 'true',
        include_imports: 'true',
      });
      if (recursive) params.set('recursive', 'true');
      const token = await accessToken(ctx);
      const body = await requestJson(
        ctx.fetch,
        `${site(ctx)}/api/v3/secrets/raw?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'Infisical',
        describeError,
      );
      const own: RawSecret[] = Array.isArray(body?.secrets) ? body.secrets : [];
      const imported: RawSecret[] = Array.isArray(body?.imports)
        ? body.imports.flatMap((i: any) => (Array.isArray(i?.secrets) ? i.secrets : []))
        : [];
      // A folder's own secrets win over imported ones with the same key.
      const ownKeys = new Set(own.map((s) => `${s.secretPath ?? folder}\u0000${s.secretKey}`));
      return [...own, ...imported.filter((s) => !ownKeys.has(`${s.secretPath ?? folder}\u0000${s.secretKey}`))];
    });
  }

  const where = (ctx: ProviderContext, folder: string) => `Infisical ${ctx.config.environment || 'dev'}:${folder}`;

  return {
    async resolve(key, ctx) {
      const { path, field } = parseReference('infisical', key);
      // A leading "/" makes the path absolute: {{infisical./NAME}} reads the root folder.
      const folder = folderOf(path || (key.trim().startsWith('/') ? '/' : ctx.config.secretPath || '/'));
      const secrets = await listSecrets(ctx, folder);
      const secret = secrets.find((s) => s.secretKey === field);
      if (!secret) {
        throw new SecretError(`Secret "${field}" not found in ${where(ctx, folder)} (${secrets.length} secrets there).`);
      }
      return secret.secretValue;
    },

    async test(ctx) {
      const folder = folderOf(ctx.config.secretPath || '/');
      const secrets = await listSecrets(ctx, folder);
      return {
        summary: `Connected to ${where(ctx, folder)}`,
        details: [`${secrets.length} secrets readable in this folder`],
      };
    },

    async browse(ctx) {
      const defaultFolder = folderOf(ctx.config.secretPath || '/');
      const secrets = await listSecrets(ctx, '/', true);
      const byFolder = new Map<string, string[]>();
      for (const s of secrets) {
        const folder = folderOf(s.secretPath ?? '/');
        byFolder.set(folder, [...(byFolder.get(folder) ?? []), s.secretKey]);
      }
      const referenceFor = (folder: string, name: string) =>
        folder === defaultFolder ? `{{infisical.${name}}}` : `{{infisical.${folder === '/' ? '' : trimSlashes(folder)}/${name}}}`;
      return [...byFolder.keys()].sort().map(
        (folder): BrowseEntry => ({
          id: folder,
          label: folder,
          kind: 'folder',
          children: [...new Set(byFolder.get(folder))].sort().map((name) => ({
            id: `${folder}#${name}`,
            label: name,
            kind: 'field',
            reference: referenceFor(folder, name),
          })),
        }),
      );
    },
  };
}
