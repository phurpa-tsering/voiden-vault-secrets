import { useCallback, useEffect, useState } from 'react';
import type { CorePluginContext } from '@voiden/sdk/ui';
import { PROVIDERS, providerInfo, type ProviderId } from './catalog';
import type { ConfigView, Draft, ProviderStatus, TestResult } from './types';
import { BrowseTab } from './ui/BrowseTab';
import { ConnectionTab } from './ui/ConnectionTab';
import { Icon } from './ui/icons';
import { ipc, isConfigured, isDirty, providerState, STATE_LABEL, Spinner, type Toast } from './ui/shared';
import { STYLES } from './ui/styles';
import { UsageTab } from './ui/UsageTab';

export { VaultIcon } from './ui/icons';

type TabId = 'connection' | 'browse' | 'usage';

const STATUS_CHANNEL = 'ext:voiden-vault-secrets:status';
const EMPTY_DRAFT: Draft = { settings: {}, secrets: {} };

// Survives the tab being closed and reopened within a session.
let lastSelection: { provider?: ProviderId; tab: TabId } = { tab: 'connection' };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What gets sent to test/browse: the form's settings plus any typed secrets. */
function draftToSend(config: ConfigView, id: ProviderId, draft: Draft): Draft {
  return {
    settings: { ...config.providers[id].settings, ...draft.settings },
    secrets: Object.fromEntries(Object.entries(draft.secrets).filter(([, v]) => v !== '')),
  };
}

function CacheControl({ config, toast, onChange }: { config: ConfigView; toast: Toast; onChange(next: ConfigView): void }) {
  const [value, setValue] = useState(String(config.cacheTtlSeconds));
  useEffect(() => setValue(String(config.cacheTtlSeconds)), [config.cacheTtlSeconds]);

  const commit = async () => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    setValue(String(seconds));
    if (seconds === config.cacheTtlSeconds) return;
    onChange(await ipc('save-general', { cacheTtlSeconds: seconds }));
    toast(seconds ? `Secrets are cached for ${seconds} s` : 'Secret caching turned off', 'info');
  };

  return (
    <div className="vs-cachebar" title="How long a secret is reused before it's fetched again. 0 turns caching off.">
      <span className="vs-muted vs-small">Cache</span>
      <input
        className="vs-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="vs-muted vs-small">s</span>
      <button
        type="button"
        className="vs-btn vs-btn-sm"
        title="Forget every cached secret, e.g. right after rotating one"
        onClick={async () => {
          await ipc('clear-cache');
          toast('Secret cache cleared', 'info');
        }}
      >
        Clear
      </button>
    </div>
  );
}

export function createSettingsPage(context: CorePluginContext) {
  const toast: Toast = (message, type = 'info') => context.ui.showToast?.(message, type);

  return function SettingsPage() {
    const [config, setConfig] = useState<ConfigView | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selected, setSelected] = useState<ProviderId>(lastSelection.provider ?? 'vault');
    const [tab, setTab] = useState<TabId>(lastSelection.tab);
    const [drafts, setDrafts] = useState<Partial<Record<ProviderId, Draft>>>({});
    const [tests, setTests] = useState<Partial<Record<ProviderId, TestResult | 'pending'>>>({});

    useEffect(() => {
      ipc('get-config')
        .then((c: ConfigView) => {
          setConfig(c);
          // First visit: open the first provider that's set up.
          if (!lastSelection.provider) setSelected(PROVIDERS.find((p) => isConfigured(c, p.id))?.id ?? 'vault');
        })
        .catch((error) => setLoadError(errorText(error)));

      const onStatus = (_event: unknown, payload: { provider: ProviderId; status: ProviderStatus }) =>
        setConfig((c) => (c ? { ...c, status: { ...c.status, [payload.provider]: payload.status } } : c));
      const bridge = (window as any).electron?.ipc;
      bridge?.on(STATUS_CHANNEL, onStatus);
      return () => bridge?.removeListener(STATUS_CHANNEL, onStatus);
    }, []);

    useEffect(() => {
      lastSelection = { provider: selected, tab };
    }, [selected, tab]);

    const draftFor = (id: ProviderId) => drafts[id] ?? EMPTY_DRAFT;

    const runTest = useCallback(
      async (id: ProviderId, draft: Draft) => {
        if (!config) return;
        setTests((t) => ({ ...t, [id]: 'pending' }));
        const result: TestResult = await ipc('test-connection', id, draftToSend(config, id, draft)).catch((error) => ({
          ok: false,
          message: errorText(error),
        }));
        setTests((t) => ({ ...t, [id]: result }));
      },
      [config],
    );

    const save = async (id: ProviderId) => {
      if (!config || !isDirty(config, id, drafts[id])) return;
      const toSave = draftToSend(config, id, draftFor(id));
      try {
        const next: ConfigView = await ipc('save-provider', id, toSave.settings, toSave.secrets);
        setConfig(next);
        setDrafts(({ [id]: _, ...rest }) => rest);
        toast(`${providerInfo(id).name} settings saved`, 'success');
        if (isConfigured(next, id)) {
          setTests((t) => ({ ...t, [id]: 'pending' }));
          const result: TestResult = await ipc('test-connection', id, draftToSend(next, id, EMPTY_DRAFT));
          setTests((t) => ({ ...t, [id]: result }));
        }
      } catch (error) {
        toast(`Couldn't save: ${errorText(error)}`, 'error');
      }
    };

    if (!config) {
      return (
        <div className="vs-root">
          <style>{STYLES}</style>
          <div className="vs-empty vs-muted" style={{ height: '100%', justifyContent: 'center' }}>
            {loadError ? <>Couldn't load Vault Secrets: {loadError}</> : <><Spinner size={18} /> Loading…</>}
          </div>
        </div>
      );
    }

    const info = providerInfo(selected);
    const { state, status } = providerState(config, selected);
    const configured = isConfigured(config, selected);
    const dirty = isDirty(config, selected, drafts[selected]);
    const test = tests[selected];

    return (
      <div
        className="vs-root"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && tab === 'connection') {
            e.preventDefault();
            e.stopPropagation();
            save(selected);
          }
        }}
      >
        <style>{STYLES}</style>
        <div className="vs-shell">
          <header className="vs-header">
            <div className="vs-logo"><Icon name="key" size={20} /></div>
            <div className="vs-grow" style={{ minWidth: 240 }}>
              <h1 className="vs-title">Vault Secrets</h1>
              <div className="vs-muted" style={{ marginTop: 4 }}>
                Reference secrets from your secret manager in any request. They're fetched when the request is sent and never
                written to your project.
              </div>
            </div>
            <CacheControl config={config} toast={toast} onChange={setConfig} />
          </header>

          {!config.providerApiAvailable && (
            <div className="vs-warning">
              <Icon name="alert" size={16} />
              <span>
                This version of Voiden can't resolve plugin variables yet, so secret references won't work in requests. Update
                Voiden to use this plugin.
              </span>
            </div>
          )}

          <div className="vs-layout">
            <nav className="vs-nav" aria-label="Secret providers">
              <div className="vs-nav-label vs-muted">Providers</div>
              {PROVIDERS.map((p) => {
                const s = providerState(config, p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="vs-nav-item"
                    aria-current={p.id === selected}
                    title={s.status?.message ?? STATE_LABEL[s.state]}
                    onClick={() => setSelected(p.id)}
                  >
                    <span className="vs-dot" data-state={s.state} />
                    <span className="vs-grow">
                      <span className="vs-nav-name" style={{ display: 'block' }}>{p.name}</span>
                      <span className="vs-nav-ns vs-mono vs-muted" style={{ display: 'block' }}>{`{{${p.namespace}.*}}`}</span>
                    </span>
                    {isDirty(config, p.id, drafts[p.id]) && <span className="vs-unsaved" title="Unsaved changes" />}
                  </button>
                );
              })}
            </nav>

            <section className="vs-card" aria-label={info.name}>
              <div className="vs-card-head">
                <div className="vs-grow">
                  <div className="vs-row" style={{ flexWrap: 'wrap' }}>
                    <h2 className="vs-card-title">{info.name}</h2>
                    <span className="vs-pill" data-state={state} title={status?.message}>
                      <span className="vs-dot" data-state={state} />
                      {STATE_LABEL[state]}
                    </span>
                  </div>
                  <div className="vs-muted" style={{ marginTop: 2 }}>
                    {info.tagline} · <span className="vs-mono vs-small">{info.pattern}</span>
                  </div>
                  {state === 'error' && status && !test && (
                    <div className="vs-small" style={{ marginTop: 6, color: 'var(--status-error)' }}>{status.message}</div>
                  )}
                </div>
              </div>

              <div className="vs-tabs" role="tablist">
                {(['connection', 'browse', 'usage'] as const).map((t) => (
                  <button key={t} type="button" role="tab" className="vs-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t === 'connection' ? 'Connection' : t === 'browse' ? 'Browse secrets' : 'How to use'}
                  </button>
                ))}
              </div>

              {tab === 'connection' && (
                <ConnectionTab
                  key={selected}
                  id={selected}
                  config={config}
                  draft={draftFor(selected)}
                  dirty={dirty}
                  test={test}
                  toast={toast}
                  onChange={(d) => setDrafts((all) => ({ ...all, [selected]: d }))}
                  onDiscard={() => setDrafts(({ [selected]: _, ...rest }) => rest)}
                  onSave={() => save(selected)}
                  onTest={() => runTest(selected, draftFor(selected))}
                />
              )}
              {tab === 'browse' && (
                <BrowseTab
                  key={selected}
                  id={selected}
                  draft={draftToSend(config, selected, draftFor(selected))}
                  configured={configured || dirty}
                  toast={toast}
                  onGoToConnection={() => setTab('connection')}
                />
              )}
              {tab === 'usage' && <UsageTab id={selected} toast={toast} />}
            </section>
          </div>
        </div>
      </div>
    );
  };
}
