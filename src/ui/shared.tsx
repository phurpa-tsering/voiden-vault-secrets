import { useState, type ReactNode } from 'react';
import { providerInfo, visibleFields, type ProviderId } from '../catalog';
import type { ConfigView, Draft, ProviderStatus } from '../types';
import { Icon } from './icons';

export const ipc = (channel: string, ...args: any[]): Promise<any> =>
  (window as any).electron?.ipc?.invoke(`ext:voiden-vault-secrets:${channel}`, ...args);

export type Toast = (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

export type ProviderState = 'connected' | 'error' | 'ready' | 'setup';

export const STATE_LABEL: Record<ProviderState, string> = {
  connected: 'Connected',
  error: 'Error',
  ready: 'Ready',
  setup: 'Not set up',
};

/** Whether the saved settings cover every required field (env overrides aren't known here). */
export function isConfigured(config: ConfigView, id: ProviderId): boolean {
  const view = config.providers[id];
  return visibleFields(providerInfo(id), view.settings).every((f) =>
    !f.required || (f.type === 'secret' ? view.secrets[f.key] !== 'none' : !!view.settings[f.key]),
  );
}

export function providerState(config: ConfigView, id: ProviderId): { state: ProviderState; status?: ProviderStatus } {
  const status = config.status[id];
  if (!isConfigured(config, id)) return { state: 'setup', status };
  if (!status) return { state: 'ready' };
  return { state: status.ok ? 'connected' : 'error', status };
}

export function isDirty(config: ConfigView, id: ProviderId, draft?: Draft): boolean {
  if (!draft) return false;
  const saved = config.providers[id].settings;
  return Object.values(draft.secrets).some((v) => v !== '') || Object.keys(draft.settings).some((k) => (draft.settings[k] ?? '') !== (saved[k] ?? ''));
}

export async function copyText(text: string, toast: Toast, what = text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`, 'success');
  } catch {
    toast("Couldn't copy to the clipboard", 'error');
  }
}

/** Inline code that copies itself on click. */
export function CopyCode({ text, toast, accent }: { text: string; toast: Toast; accent?: boolean }) {
  return (
    <button type="button" className={`vs-code vs-code-btn${accent ? ' vs-ref' : ''}`} title="Click to copy" onClick={() => copyText(text, toast)}>
      {text}
    </button>
  );
}

/** Render text with `backticks` as copyable code. */
export function RichText({ text, toast }: { text: string; toast: Toast }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? <CopyCode key={i} text={part.slice(1, -1)} toast={toast} /> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Icon name="loader" size={size} className="vs-spin" />;
}

/** Button with a pending state for async actions. */
export function AsyncButton({
  onClick,
  children,
  className = '',
  disabled,
  title,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={`vs-btn ${className}`}
      disabled={disabled || pending}
      title={title}
      onClick={async () => {
        setPending(true);
        try {
          await onClick();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending && <Spinner size={13} />}
      {children}
    </button>
  );
}
