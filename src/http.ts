/**
 * HTTP and process plumbing shared by the providers. No Electron or Node-only
 * imports, so providers can be unit tested with a fake fetch / exec.
 */

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export type ExecLike = (
  file: string,
  args: string[],
  options: { input?: string; timeoutMs?: number },
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export const REQUEST_TIMEOUT_MS = 10_000;

export class SecretError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'SecretError';
  }
}

/** Validate and normalise a base URL setting. */
export function baseUrl(address: string, what: string): string {
  const trimmed = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new SecretError(`${what} "${address}" must start with http:// or https://.`);
  }
  return trimmed;
}

/**
 * Send a request and parse its JSON body. Network failures and non-2xx
 * responses become SecretErrors; `describeError` turns a status and error
 * body into a message the user can act on.
 */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown },
  service: string,
  describeError: (status: number, body: any) => string,
): Promise<any> {
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SecretError(`Can't reach ${service} at ${new URL(url).origin} (${reason}).`);
  }

  if (response.ok) return response.json();
  const errorBody = await response.json().catch(() => undefined);
  throw new SecretError(describeError(response.status, errorBody), response.status);
}
