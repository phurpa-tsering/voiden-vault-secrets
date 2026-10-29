/**
 * Short-lived in-memory cache of secret reads, so a request with several
 * references to one secret — or a run of requests — fetches it once.
 * Failed reads are never cached, so the next request retries.
 */

export interface SecretCache {
  get<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  clear(): void;
}

export function createCache(now: () => number = Date.now): SecretCache {
  const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  return {
    get<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value as Promise<T>;

      const value = load();
      if (ttlSeconds > 0) {
        const entry = { expiresAt: now() + ttlSeconds * 1000, value };
        entries.set(key, entry);
        value.catch(() => {
          if (entries.get(key) === entry) entries.delete(key);
        });
      }
      return value;
    },
    clear: () => entries.clear(),
  };
}
