/** Shapes passed between the main process and the settings page over IPC. */

import type { ProviderId } from './catalog';

/** How a secret field is stored: encrypted on disk, in memory for this session only, or not at all. */
export type SecretState = 'saved' | 'session' | 'none';

export interface ProviderView {
  settings: Record<string, string>;
  secrets: Record<string, SecretState>;
}

export interface ProviderStatus {
  ok: boolean;
  message: string;
  at: number;
}

export interface ConfigView {
  cacheTtlSeconds: number;
  encryptionAvailable: boolean;
  /** False on Voiden versions without env.registerVariableProvider. */
  providerApiAvailable: boolean;
  providers: Record<ProviderId, ProviderView>;
  status: Partial<Record<ProviderId, ProviderStatus>>;
}

/** Unsaved form state the settings page can test or browse with. */
export interface Draft {
  settings: Record<string, string>;
  /** A string replaces the saved secret, null removes it, absent keeps it. */
  secrets: Record<string, string | null>;
}

export interface TestSummary {
  summary: string;
  details?: string[];
}

export type TestResult =
  | ({ ok: true } & TestSummary)
  | { ok: false; message: string; code?: string };

/**
 * One row of the secret browser. Values are never included — only names and
 * the reference to paste into a request.
 */
export interface BrowseEntry {
  id: string;
  label: string;
  kind: 'folder' | 'secret' | 'field';
  detail?: string;
  /** Fields only: the full reference, e.g. {{vault.myapp/db#password}} */
  reference?: string;
  children?: BrowseEntry[];
  /** Children are loaded on demand by browsing this entry's id. */
  lazy?: boolean;
}

export type BrowseResult = { ok: true; entries: BrowseEntry[] } | { ok: false; message: string; code?: string };
