import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { providerInfo, type ProviderId } from '../catalog';
import type { BrowseEntry, BrowseResult, Draft } from '../types';
import { Icon } from './icons';
import { copyText, ipc, RichText, Spinner, type Toast } from './shared';

interface Props {
  id: ProviderId;
  draft: Draft;
  configured: boolean;
  toast: Toast;
  onGoToConnection(): void;
}

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; entries: BrowseEntry[] };

const matches = (entry: BrowseEntry, q: string) =>
  entry.label.toLowerCase().includes(q) || !!entry.reference?.toLowerCase().includes(q);

/** Keep entries that match, or that contain a match (with only the matching children). */
function filterTree(entries: BrowseEntry[], q: string, lazyChildren: Record<string, BrowseEntry[]>): BrowseEntry[] {
  const out: BrowseEntry[] = [];
  for (const entry of entries) {
    const children = entry.children ?? lazyChildren[entry.id];
    if (matches(entry, q)) {
      out.push(entry);
      continue;
    }
    const kept = children ? filterTree(children, q, lazyChildren) : [];
    if (kept.length) out.push({ ...entry, children: kept, lazy: false });
  }
  return out;
}

const countFields = (entries: BrowseEntry[]): number =>
  entries.reduce((n, e) => n + (e.kind === 'field' ? 1 : countFields(e.children ?? [])), 0);

export function BrowseTab({ id, draft, configured, toast, onGoToConnection }: Props) {
  const info = providerInfo(id);
  const [root, setRoot] = useState<Loaded>({ state: 'loading' });
  const [lazy, setLazy] = useState<Record<string, BrowseEntry[]>>({});
  const [lazyState, setLazyState] = useState<Record<string, 'loading' | string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setRoot({ state: 'loading' });
    setLazy({});
    setLazyState({});
    const res: BrowseResult = await ipc('browse', id, undefined, draft);
    setRoot(res.ok ? { state: 'done', entries: res.entries } : { state: 'error', message: res.message });
    // Small trees start expanded (lazy entries load on click, so they stay closed).
    if (res.ok && res.entries.length <= 3) setOpen(new Set(res.entries.filter((e) => e.children).map((e) => e.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (configured) load();
  }, [configured, load]);

  const toggle = async (entry: BrowseEntry) => {
    const next = new Set(open);
    if (next.has(entry.id)) {
      next.delete(entry.id);
      setOpen(next);
      return;
    }
    next.add(entry.id);
    setOpen(next);
    if (entry.lazy && !lazy[entry.id]) {
      setLazyState((s) => ({ ...s, [entry.id]: 'loading' }));
      const res: BrowseResult = await ipc('browse', id, entry.id, draft);
      if (res.ok) {
        setLazy((l) => ({ ...l, [entry.id]: res.entries }));
        setLazyState(({ [entry.id]: _, ...rest }) => rest);
      } else {
        setLazyState((s) => ({ ...s, [entry.id]: res.message }));
      }
    }
  };

  const q = query.trim().toLowerCase();
  const entries = root.state === 'done' ? root.entries : [];
  const visible = useMemo(() => (q ? filterTree(entries, q, lazy) : entries), [entries, q, lazy]);

  if (!configured) {
    return (
      <div className="vs-body">
        <div className="vs-empty">
          <Icon name="key" size={22} />
          <div style={{ fontWeight: 500 }}>Connect {info.name} first</div>
          <div className="vs-muted">Once it's set up, browse here and copy references instead of typing them.</div>
          <button type="button" className="vs-btn vs-btn-primary" onClick={onGoToConnection}>Set up connection</button>
        </div>
      </div>
    );
  }

  const renderEntry = (entry: BrowseEntry, depth: number): ReactNode => {
    const pad = { paddingLeft: 6 + depth * 18 };
    if (entry.kind === 'field') {
      return (
        <button
          type="button"
          key={entry.id}
          className="vs-tree-row"
          style={pad}
          title={`Copy ${entry.reference}`}
          onClick={() => copyText(entry.reference!, toast)}
        >
          <span style={{ width: 12 }} />
          <Icon name="braces" size={13} className="vs-muted" />
          <span className="vs-truncate" style={{ width: 150, flex: 'none' }} title={entry.label}>{entry.label}</span>
          <span className="vs-mono vs-small vs-ref vs-truncate vs-grow">{entry.reference}</span>
          <span className="vs-copy-hint vs-row vs-muted vs-small"><Icon name="copy" size={12} /> Copy</span>
        </button>
      );
    }
    const isOpen = open.has(entry.id) || !!q;
    const children = entry.children ?? lazy[entry.id];
    const status = lazyState[entry.id];
    return (
      <div key={entry.id}>
        <button type="button" className="vs-tree-row" style={pad} onClick={() => toggle(entry)} aria-expanded={isOpen}>
          <span className="vs-chevron vs-row" data-open={isOpen}><Icon name="chevron" size={12} /></span>
          <Icon name={entry.kind === 'folder' ? 'folder' : 'file'} size={13} className="vs-muted" />
          <span className="vs-truncate">{entry.label}</span>
          {entry.detail && <span className="vs-muted vs-small vs-truncate">{entry.detail}</span>}
          {status === 'loading' && <Spinner size={12} />}
        </button>
        {isOpen && status && status !== 'loading' && (
          <div className="vs-small" style={{ ...pad, paddingLeft: 6 + (depth + 1) * 18 + 18, color: 'var(--status-error)' }}>{status}</div>
        )}
        {isOpen && children?.length === 0 && (
          <div className="vs-small vs-muted" style={{ paddingLeft: 6 + (depth + 1) * 18 + 18, paddingBlock: 4 }}>Empty</div>
        )}
        {isOpen && children?.map((child) => renderEntry(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="vs-body">
      <div className="vs-row">
        <div className="vs-input-wrap">
          <input
            className="vs-input"
            style={{ fontFamily: 'inherit', paddingLeft: 30 }}
            placeholder={`Search ${info.name}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="vs-muted" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <Icon name="search" size={13} />
          </span>
        </div>
        <button type="button" className="vs-btn" onClick={load} disabled={root.state === 'loading'} title="Reload from the provider">
          <Icon name="refresh" size={13} className={root.state === 'loading' ? 'vs-spin' : undefined} /> Refresh
        </button>
      </div>

      {root.state === 'loading' && (
        <div className="vs-empty vs-muted"><Spinner size={18} /> Loading…</div>
      )}

      {root.state === 'error' && (
        <div className="vs-banner" data-kind="error">
          <span className="vs-banner-icon"><Icon name="alert" size={16} /></span>
          <div className="vs-grow"><RichText text={root.message} toast={toast} /></div>
          <button type="button" className="vs-btn vs-btn-sm" onClick={onGoToConnection}>Check connection</button>
        </div>
      )}

      {root.state === 'done' && (
        <>
          <div className="vs-muted vs-small vs-row">
            <Icon name="shield" size={12} />
            Values are never shown here. Click a field to copy its reference, then paste it into a request.
          </div>
          {visible.length ? (
            <div className="vs-tree">{visible.map((e) => renderEntry(e, 0))}</div>
          ) : (
            <div className="vs-empty vs-muted">{q ? `Nothing matches "${query}".` : 'No secrets found.'}</div>
          )}
          {!q && countFields(entries) > 0 && (
            <div className="vs-muted vs-small">{countFields(entries)} fields</div>
          )}
        </>
      )}
    </div>
  );
}
