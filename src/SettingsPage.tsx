import { useEffect, useState } from 'react';
import type { CorePluginContext } from '@voiden/sdk/ui';

// Mirrors VaultSettings in resolver.ts (kept separate so the renderer bundle
// doesn't pull in main-process code).
interface VaultSettings {
  address: string;
  namespace: string;
  mount: string;
  kvVersion: 1 | 2;
  defaultPath: string;
  cacheTtlSeconds: number;
}

interface ConfigState {
  settings: VaultSettings;
  hasToken: boolean;
  tokenPersisted: boolean;
  encryptionAvailable: boolean;
  providerAvailable: boolean;
  envOverrides: Record<string, string>;
}

type TestResult = { ok: true; displayName: string; policies: string[]; ttl: number } | { ok: false; message: string };

export const ipc = (channel: string, ...args: any[]) =>
  (window as any).electron?.ipc?.invoke(`ext:voiden-vault-secrets:${channel}`, ...args);

/** Vault key icon, used for the top-bar button and the tab. */
export function VaultIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

const join = (...classes: string[]) => classes.join(' ');

function formatTtl(seconds: number): string {
  if (!seconds) return 'never expires';
  if (seconds < 3600) return `expires in ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `expires in ${Math.round(seconds / 3600)} h`;
  return `expires in ${Math.round(seconds / 86400)} days`;
}

export function createSettingsPage(context: CorePluginContext) {
  const t = context.theme;

  return function SettingsPage() {
    const [config, setConfig] = useState<ConfigState | null>(null);
    const [draft, setDraft] = useState<VaultSettings | null>(null);
    const [tokenInput, setTokenInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    useEffect(() => {
      ipc('get-config').then((c: ConfigState) => {
        setConfig(c);
        setDraft(c.settings);
      });
    }, []);

    if (!config || !draft) {
      return <div className={join(t.bg.editor, t.text.muted)} style={{ padding: 24, height: '100%' }}>Loading…</div>;
    }

    const set = <K extends keyof VaultSettings>(key: K, value: VaultSettings[K]) => setDraft({ ...draft, [key]: value });

    const save = async (token?: string | null) => {
      setSaving(true);
      try {
        const next: Omit<ConfigState, 'providerAvailable' | 'envOverrides'> = await ipc('save-config', draft, token);
        setConfig({ ...config, ...next });
        setTokenInput('');
        setTestResult(null);
        context.ui.showToast?.('Vault settings saved', 'success');
      } catch (error) {
        context.ui.showToast?.(`Couldn't save Vault settings: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        setSaving(false);
      }
    };

    const test = async () => {
      setTesting(true);
      setTestResult(await ipc('test-connection'));
      setTesting(false);
    };

    const inputStyle = { width: '100%', padding: '6px 8px', borderRadius: 6, borderWidth: 1, fontSize: 13, fontFamily: 'monospace' } as const;
    const inputClass = join(t.bg.panel, t.border.DEFAULT, t.text.primary);
    const label = (text: string, hint?: string) => (
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{text}</span>
        {hint && <span className={t.text.muted} style={{ fontSize: 12, marginLeft: 6 }}>{hint}</span>}
      </div>
    );
    const button = (text: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean } = {}) => (
      <button
        onClick={onClick}
        disabled={opts.disabled}
        className={opts.primary ? join(t.button.primary, 'text-white') : join(t.bg.panel, t.border.DEFAULT, t.text.primary)}
        style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, borderWidth: opts.primary ? 0 : 1, cursor: opts.disabled ? 'default' : 'pointer', opacity: opts.disabled ? 0.6 : 1 }}
      >
        {text}
      </button>
    );

    return (
      <div className={join(t.bg.editor, t.text.primary)} style={{ height: '100%', overflowY: 'auto' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={t.text.accent}><VaultIcon size={22} /></span>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Vault Secrets</h1>
          </div>
          <p className={t.text.muted} style={{ fontSize: 13, margin: 0 }}>
            Reference secrets as <code>{'{{vault.path#field}}'}</code> in any request. They're read from Vault when the
            request is sent and never stored in your project.
          </p>

          {!config.providerAvailable && (
            <div className={join(t.bg.panel, t.border.DEFAULT)} style={{ borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 13 }}>
              ⚠️ This version of Voiden can't resolve plugin variables yet, so <code>{'{{vault.*}}'}</code> references won't
              work. Update Voiden to use this plugin.
            </div>
          )}

          <div>
            {label('Vault address', `or ${config.envOverrides.address} in your environment`)}
            <input className={inputClass} style={inputStyle} placeholder="https://vault.example.com:8200" value={draft.address} onChange={(e) => set('address', e.target.value)} />
          </div>

          <div>
            {label('Token', config.hasToken ? (config.tokenPersisted ? 'saved, encrypted' : 'set for this session only') : 'not set')}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                autoComplete="off"
                className={inputClass}
                style={inputStyle}
                placeholder={config.hasToken ? '•••••••• (enter a new token to replace)' : 'hvs.…'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              {config.hasToken && button('Remove', () => save(null), { disabled: saving })}
            </div>
            {!config.encryptionAvailable && (
              <div className={t.text.muted} style={{ fontSize: 12, marginTop: 4 }}>
                OS encryption isn't available, so the token is kept in memory until Voiden quits. Alternatively set {config.envOverrides.token} in a private environment.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('KV mount', 'default "secret"')}
              <input className={inputClass} style={inputStyle} value={draft.mount} onChange={(e) => set('mount', e.target.value)} />
            </div>
            <div>
              {label('KV version')}
              <select className={inputClass} style={inputStyle} value={draft.kvVersion} onChange={(e) => set('kvVersion', Number(e.target.value) === 1 ? 1 : 2)}>
                <option value={2}>v2 (versioned)</option>
                <option value={1}>v1</option>
              </select>
            </div>
            <div>
              {label('Namespace', 'Enterprise / HCP only')}
              <input className={inputClass} style={inputStyle} placeholder="admin" value={draft.namespace} onChange={(e) => set('namespace', e.target.value)} />
            </div>
            <div>
              {label('Cache (seconds)', '0 = off')}
              <input type="number" min={0} className={inputClass} style={inputStyle} value={draft.cacheTtlSeconds} onChange={(e) => set('cacheTtlSeconds', Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>

          <div>
            {label('Default secret path', 'used by {{vault.name}} without a path')}
            <input className={inputClass} style={inputStyle} placeholder="myapp/dev" value={draft.defaultPath} onChange={(e) => set('defaultPath', e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {button(saving ? 'Saving…' : 'Save', () => save(tokenInput ? tokenInput : undefined), { primary: true, disabled: saving })}
            {button(testing ? 'Testing…' : 'Test connection', test, { disabled: testing || saving })}
            {button('Clear cache', async () => { await ipc('clear-cache'); context.ui.showToast?.('Vault cache cleared', 'info'); })}
          </div>

          {testResult && (
            <div className={join(t.bg.panel, t.border.DEFAULT)} style={{ borderWidth: 1, borderRadius: 6, padding: 12, fontSize: 13 }}>
              {testResult.ok
                ? <>✅ Connected{testResult.displayName ? ` as ${testResult.displayName}` : ''} · {formatTtl(testResult.ttl)}{testResult.policies.length ? ` · policies: ${testResult.policies.join(', ')}` : ''}</>
                : <>❌ {testResult.message}</>}
              <div className={t.text.muted} style={{ fontSize: 12, marginTop: 4 }}>Tests the saved settings — save first if you changed them.</div>
            </div>
          )}

          <div className={t.text.muted} style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>Reference syntax</div>
            <code>{'{{vault.myapp/db#password}}'}</code> — field <code>password</code> of secret <code>myapp/db</code><br />
            <code>{'{{vault.myapp/api_key}}'}</code> — field <code>api_key</code> of secret <code>myapp</code><br />
            <code>{'{{vault.api_key}}'}</code> — field <code>api_key</code> of the default secret path<br />
            Per environment, {Object.values(config.envOverrides).join(', ')} override these settings.
          </div>
        </div>
      </div>
    );
  };
}
