/**
 * Doppler — reads a whole config in one call and picks fields from it.
 *
 *   GET /v3/configs/config/secrets/download?format=json[&project=&config=]
 *   GET /v3/me    (token name for the connection test; best effort)
 *
 * A service token is scoped to one config, so project/config are optional;
 * a personal token needs both.
 */

import { requestJson, SecretError } from '../http';
import { parseReference } from '../reference';
import type { Provider, ProviderContext } from './types';

export const DOPPLER_API = 'https://api.doppler.com';

function describeError(status: number, body: any): string {
  const detail = Array.isArray(body?.messages) && body.messages.length ? body.messages.join(' ') : '';
  switch (status) {
    case 401:
      return `Doppler rejected the token${detail ? ` (${detail})` : ''} — check it hasn't been revoked.`;
    case 403:
      return `The Doppler token can't read this config${detail ? ` (${detail})` : ''}.`;
    case 404:
      return detail || 'Doppler project or config not found.';
    default:
      return detail ? `Doppler: ${detail}` : `Doppler returned HTTP ${status}.`;
  }
}

/** "" → configured project/config · "cfg" → configured project, config cfg · "proj/cfg" */
function scopeOf(ctx: ProviderContext, path: string): { project: string; config: string } {
  const parts = path ? path.split('/') : [];
  if (parts.length > 2) throw new SecretError(`"${path}" isn't a Doppler config — use {{doppler.project/config/NAME}}.`);
  if (parts.length === 2) return { project: parts[0], config: parts[1] };
  if (parts.length === 1) return { project: ctx.config.project ?? '', config: parts[0] };
  return { project: ctx.config.project ?? '', config: ctx.config.config ?? '' };
}

const scopeLabel = ({ project, config }: { project: string; config: string }) =>
  project || config ? `${project || '(token project)'}/${config || '(token config)'}` : "the token's config";

function download(ctx: ProviderContext, scope: { project: string; config: string }): Promise<Record<string, string>> {
  return ctx.cached(['download', scope.project, scope.config], async () => {
    const params = new URLSearchParams({ format: 'json' });
    if (scope.project) params.set('project', scope.project);
    if (scope.config) params.set('config', scope.config);
    const body = await requestJson(
      ctx.fetch,
      `${DOPPLER_API}/v3/configs/config/secrets/download?${params}`,
      { headers: { Authorization: `Bearer ${ctx.config.token}` } },
      'Doppler',
      describeError,
    );
    if (!body || typeof body !== 'object') throw new SecretError(`Doppler returned no secrets for ${scopeLabel(scope)}.`);
    return body;
  });
}

export const dopplerProvider: Provider = {
  async resolve(key, ctx) {
    const { path, field } = parseReference('doppler', key);
    const scope = scopeOf(ctx, path);
    const secrets = await download(ctx, scope);
    if (!(field in secrets)) {
      throw new SecretError(`Secret "${field}" not found in Doppler ${scopeLabel(scope)} (${Object.keys(secrets).length} secrets there).`);
    }
    return String(secrets[field]);
  },

  async test(ctx) {
    const scope = scopeOf(ctx, '');
    const secrets = await download(ctx, scope);
    const me = await requestJson(ctx.fetch, `${DOPPLER_API}/v3/me`, { headers: { Authorization: `Bearer ${ctx.config.token}` } }, 'Doppler', describeError)
      .catch(() => undefined);
    const project = secrets.DOPPLER_PROJECT ?? scope.project;
    const config = secrets.DOPPLER_CONFIG ?? scope.config;
    return {
      summary: `Connected${project && config ? ` to ${project}/${config}` : ''}`,
      details: [
        `${Object.keys(secrets).length} secrets readable`,
        ...(me?.name ? [`Token: ${me.name}${me.workplace?.name ? ` (${me.workplace.name})` : ''}`] : []),
      ],
    };
  },

  async browse(ctx) {
    const secrets = await download(ctx, scopeOf(ctx, ''));
    return Object.keys(secrets)
      .sort()
      .map((name) => ({ id: name, label: name, kind: 'field' as const, reference: `{{doppler.${name}}}` }));
  },
};
