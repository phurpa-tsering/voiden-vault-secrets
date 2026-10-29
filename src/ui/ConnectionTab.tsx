import { useState } from 'react';
import { providerInfo, visibleFields, type FieldSpec, type ProviderId } from '../catalog';
import type { ConfigView, Draft, SecretState, TestResult } from '../types';
import { Icon } from './icons';
import { AsyncButton, ipc, RichText, Spinner, type Toast } from './shared';

interface Props {
  id: ProviderId;
  config: ConfigView;
  draft: Draft;
  dirty: boolean;
  test?: TestResult | 'pending';
  toast: Toast;
  onChange(draft: Draft): void;
  onSave(): Promise<void>;
  onDiscard(): void;
  onTest(): Promise<void>;
}

function FieldLabel({ field }: { field: FieldSpec }) {
  return (
    <div className="vs-label">
      <span className="vs-label-text">{field.label}</span>
      {field.hint && <span className="vs-muted vs-small">{field.hint}</span>}
      {field.env && (
        <span className="vs-env vs-muted" title={`${field.env} in the active Voiden environment overrides this when a request is sent`}>
          {field.env}
        </span>
      )}
    </div>
  );
}

function PasswordInput({ value, placeholder, autoFocus, onChange, onEnter }: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange(value: string): void;
  onEnter?(): void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="vs-input-wrap">
      <input
        type={reveal ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className="vs-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      <button type="button" className="vs-btn vs-btn-icon vs-input-icon" title={reveal ? 'Hide' : 'Show what you typed'} onClick={() => setReveal(!reveal)}>
        <Icon name={reveal ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}

/**
 * A saved secret is never shown: it reads "Saved · encrypted" with Replace /
 * Remove. `value` is the draft: undefined keeps the saved one, null removes
 * it, a string (possibly still empty) replaces it.
 */
function SecretField({ field, state, value, onChange }: {
  field: FieldSpec;
  state: SecretState;
  value: string | null | undefined;
  onChange(value: string | null | undefined): void;
}) {
  if (value === null) {
    return (
      <div className="vs-secret-saved">
        <span className="vs-grow vs-muted">Will be removed when you save</span>
        <button type="button" className="vs-btn vs-btn-sm vs-btn-ghost" onClick={() => onChange(undefined)}>Undo</button>
      </div>
    );
  }
  if (value === undefined && state !== 'none') {
    return (
      <div className="vs-secret-saved">
        <span className="vs-mono vs-muted">••••••••••••</span>
        <span className="vs-secret-badge vs-grow" data-session={state === 'session'}>
          <Icon name={state === 'saved' ? 'shield' : 'alert'} size={12} />
          {state === 'saved' ? 'Saved · encrypted' : 'This session only'}
        </span>
        <button type="button" className="vs-btn vs-btn-sm" onClick={() => onChange('')}>Replace</button>
        <button type="button" className="vs-btn vs-btn-sm vs-btn-ghost vs-btn-danger" onClick={() => onChange(null)}>Remove</button>
      </div>
    );
  }
  return (
    <div className="vs-row">
      <PasswordInput value={value ?? ''} placeholder={field.placeholder} autoFocus={state !== 'none'} onChange={onChange} />
      {state !== 'none' && (
        <button type="button" className="vs-btn vs-btn-ghost" onClick={() => onChange(undefined)}>Cancel</button>
      )}
    </div>
  );
}

function SettingField({ id, field, value, onChange }: { id: ProviderId; field: FieldSpec; value: string; onChange(value: string): void }) {
  if (field.type === 'select') {
    return (
      <select className="vs-input" value={value || field.default} onChange={(e) => onChange(e.target.value)}>
        {field.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  const input = (
    <input
      className="vs-input"
      spellCheck={false}
      placeholder={field.placeholder ?? field.default}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (field.type !== 'path') return input;
  return (
    <div className="vs-row">
      {input}
      <AsyncButton
        onClick={async () => {
          const picked: string | null = await ipc('pick-file', id, field.key);
          if (picked) onChange(picked);
        }}
      >
        <Icon name="folder" /> Choose…
      </AsyncButton>
    </div>
  );
}

function TestBanner({ id, result, draft, toast, onRetest }: {
  id: ProviderId;
  result: TestResult | 'pending';
  draft: Draft;
  toast: Toast;
  onRetest(): Promise<void>;
}) {
  const [password, setPassword] = useState('');

  if (result === 'pending') {
    return (
      <div className="vs-banner" data-kind="info">
        <Spinner /> <span>Testing connection…</span>
      </div>
    );
  }
  if (result.ok) {
    return (
      <div className="vs-banner" data-kind="ok">
        <span className="vs-banner-icon"><Icon name="check" size={16} /></span>
        <div className="vs-grow">
          <div style={{ fontWeight: 500 }}>{result.summary}</div>
          {result.details?.map((d) => <div key={d} className="vs-muted vs-small">{d}</div>)}
        </div>
        {id === 'bitwarden' && <BitwardenActions draft={draft} toast={toast} onDone={onRetest} />}
      </div>
    );
  }

  const unlock = async () => {
    const res = await ipc('action', id, 'unlock', password, draft);
    setPassword('');
    if (!res.ok) return toast(res.message, 'error');
    toast(res.message, 'success');
    await onRetest();
  };

  return (
    <div className="vs-banner" data-kind="error">
      <span className="vs-banner-icon"><Icon name="alert" size={16} /></span>
      <div className="vs-grow" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div><RichText text={result.message} toast={toast} /></div>
        {result.code === 'locked' && (
          <div className="vs-row">
            <PasswordInput value={password} placeholder="Master password" autoFocus onChange={setPassword} onEnter={() => password && unlock()} />
            <AsyncButton className="vs-btn-primary" disabled={!password} onClick={unlock}>
              <Icon name="lock" /> Unlock
            </AsyncButton>
          </div>
        )}
        {result.code === 'locked' && (
          <div className="vs-muted vs-small">Sent to your local bw serve only; never stored.</div>
        )}
      </div>
    </div>
  );
}

function BitwardenActions({ draft, toast, onDone }: { draft: Draft; toast: Toast; onDone(): Promise<void> }) {
  const run = (action: string) => async () => {
    const res = await ipc('action', 'bitwarden', action, undefined, draft);
    toast(res.message, res.ok ? 'success' : 'error');
    await onDone();
  };
  return (
    <div className="vs-row">
      <AsyncButton className="vs-btn-sm" onClick={run('sync')} title="Pull the latest items from the Bitwarden server">
        <Icon name="refresh" size={12} /> Sync
      </AsyncButton>
      <AsyncButton className="vs-btn-sm" onClick={run('lock')}>
        <Icon name="lock" size={12} /> Lock
      </AsyncButton>
    </div>
  );
}

/** Group consecutive half-width fields into two-column rows. */
function layoutRows(fields: FieldSpec[]): FieldSpec[][] {
  const rows: FieldSpec[][] = [];
  for (const field of fields) {
    const last = rows[rows.length - 1];
    if (field.half && last?.length === 1 && last[0].half) last.push(field);
    else rows.push([field]);
  }
  return rows;
}

export function ConnectionTab({ id, config, draft, dirty, test, toast, onChange, onSave, onDiscard, onTest }: Props) {
  const info = providerInfo(id);
  const view = config.providers[id];
  const settings = { ...view.settings, ...draft.settings };
  const fields = visibleFields(info, settings);

  const setSetting = (key: string, value: string) => onChange({ ...draft, settings: { ...draft.settings, [key]: value } });
  const setSecret = (key: string, value: string | null | undefined) => {
    const secrets = { ...draft.secrets };
    if (value === undefined) delete secrets[key];
    else secrets[key] = value;
    onChange({ ...draft, secrets });
  };

  const renderField = (field: FieldSpec) => (
    <div className="vs-field" key={field.key}>
      <FieldLabel field={field} />
      {field.type === 'secret' ? (
        <SecretField field={field} state={view.secrets[field.key]} value={draft.secrets[field.key]} onChange={(v) => setSecret(field.key, v)} />
      ) : (
        <SettingField id={id} field={field} value={settings[field.key] ?? ''} onChange={(v) => setSetting(field.key, v)} />
      )}
    </div>
  );

  const hasSecrets = info.fields.some((f) => f.type === 'secret');

  return (
    <>
      <div className="vs-body">
        {layoutRows(fields).map((row) =>
          row.length === 2 ? (
            <div className="vs-grid" key={row[0].key}>{row.map(renderField)}</div>
          ) : (
            renderField(row[0])
          ),
        )}

        {hasSecrets && !config.encryptionAvailable && (
          <div className="vs-banner" data-kind="info">
            <span className="vs-banner-icon"><Icon name="alert" size={16} /></span>
            <span className="vs-small">
              OS encryption isn't available, so secrets are kept in memory until Voiden quits. Alternatively set them in a
              private Voiden environment using the variable names shown next to each field.
            </span>
          </div>
        )}

        {test && <TestBanner id={id} result={test} draft={draft} toast={toast} onRetest={onTest} />}
      </div>

      <div className="vs-footer">
        {dirty ? (
          <>
            <span className="vs-unsaved" />
            <span>Unsaved changes</span>
            <button type="button" className="vs-btn vs-btn-ghost vs-btn-sm" onClick={onDiscard}>Discard</button>
          </>
        ) : (
          <span className="vs-row vs-muted vs-small">
            <Icon name="shield" size={13} />
            {hasSecrets ? 'Secrets are encrypted with your OS keychain and never shown again.' : 'Nothing secret is stored for this provider.'}
          </span>
        )}
        <div className="vs-row" style={{ marginLeft: 'auto' }}>
          <AsyncButton onClick={onTest} disabled={test === 'pending'} title="Tests what's in the form, saved or not">
            Test connection
          </AsyncButton>
          <AsyncButton className="vs-btn-primary" onClick={onSave} disabled={!dirty} title="Save (⌘S / Ctrl+S)">
            Save
          </AsyncButton>
        </div>
      </div>
    </>
  );
}
