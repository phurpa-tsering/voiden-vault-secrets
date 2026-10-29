import { vi } from 'vitest';
import { sanitizeSettings, type ProviderId } from '../src/catalog';
import type { ExecLike, FetchLike } from '../src/http';
import { bitwardenProvider } from '../src/providers/bitwarden';
import { dopplerProvider } from '../src/providers/doppler';
import { createInfisicalProvider } from '../src/providers/infisical';
import { createKeepassProvider } from '../src/providers/keepass';
import { vaultProvider } from '../src/providers/vault';
import { createSecretsService } from '../src/service';

export const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

type Route = (url: URL, init: Parameters<FetchLike>[1]) => ReturnType<typeof json> | undefined;

/** A fetch that answers from `route`, 404 when it returns undefined. */
export function fakeFetch(route: Route) {
  return vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async (url, init) => route(new URL(url), init) ?? json(404, {}));
}

export function setup(opts: {
  provider: ProviderId;
  settings?: Record<string, string>;
  secrets?: Record<string, string>;
  fetch?: FetchLike;
  exec?: ExecLike;
  ttl?: number;
}) {
  let time = 0;
  const settings = sanitizeSettings(opts.provider, opts.settings);
  const service = createSecretsService({
    store: {
      getProvider: (id) => (id === opts.provider ? { settings, secrets: opts.secrets ?? {} } : { settings: sanitizeSettings(id), secrets: {} }),
      getCacheTtlSeconds: () => opts.ttl ?? 60,
    },
    fetch: opts.fetch ?? fakeFetch(() => undefined),
    exec: opts.exec ?? (async () => ({ code: 1, stdout: '', stderr: 'no exec in this test' })),
    now: () => time,
    providers: {
      vault: vaultProvider,
      doppler: dopplerProvider,
      infisical: createInfisicalProvider(() => time),
      bitwarden: bitwardenProvider,
      keepass: createKeepassProvider({ findCli: () => '/bin/keepassxc-cli', expandPath: (p) => p.replace(/^~/, '/home/me') }),
    },
  });
  return {
    service,
    resolve: (key: string, env?: Record<string, string>) => service.resolve(opts.provider, key, env),
    advance: (ms: number) => {
      time += ms;
    },
  };
}
