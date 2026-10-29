import type { BrowseEntry, TestSummary } from '../types';
import type { ExecLike, FetchLike } from '../http';

export interface ProviderContext {
  /** Saved settings and secrets, with draft values and environment overrides applied. */
  config: Readonly<Record<string, string>>;
  fetch: FetchLike;
  exec: ExecLike;
  /** Cache a read for the configured TTL, scoped to this provider and connection. */
  cached<T>(parts: string[], load: () => Promise<T>): Promise<T>;
}

export interface Provider {
  /** Resolve the key of a {{namespace.key}} reference. */
  resolve(key: string, ctx: ProviderContext): Promise<string>;
  /** Check the connection and describe it. */
  test(ctx: ProviderContext): Promise<TestSummary>;
  /** List what can be referenced; `parent` is a lazy entry's id. Never returns secret values. */
  browse(ctx: ProviderContext, parent?: string): Promise<BrowseEntry[]>;
  /** Extra operations the settings page can trigger (e.g. unlock), returning a message. */
  actions?: Record<string, (ctx: ProviderContext, arg?: string) => Promise<string>>;
}
