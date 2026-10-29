import { providerInfo, type ProviderId } from '../catalog';
import { Icon } from './icons';
import { CopyCode, RichText, type Toast } from './shared';

export function UsageTab({ id, toast }: { id: ProviderId; toast: Toast }) {
  const info = providerInfo(id);
  const envFields = info.fields.filter((f) => f.env);

  return (
    <div className="vs-body" style={{ gap: 24 }}>
      <section>
        <h3 className="vs-section-title vs-muted">Setup</h3>
        <ol className="vs-steps">
          {info.setup.map((step) => <li key={step}><RichText text={step} toast={toast} /></li>)}
        </ol>
      </section>

      <section>
        <h3 className="vs-section-title vs-muted">Reference syntax</h3>
        <table className="vs-table">
          <tbody>
            {info.examples.map((ex) => (
              <tr key={ex.reference}>
                <td style={{ width: '1%', whiteSpace: 'nowrap' }}><CopyCode text={ex.reference} toast={toast} accent /></td>
                <td className="vs-muted">{ex.reads}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className="vs-pre" style={{ marginTop: 10 }}>
          <span className="vs-muted">Authorization: Bearer </span>
          <span className="vs-ref">{info.examples[0].reference}</span>
        </pre>
        <p className="vs-muted vs-small" style={{ margin: '8px 0 0' }}>
          Use references anywhere a variable works: URL, headers, query, body. They're resolved when the request is sent; if
          one can't be read, the request isn't sent and a toast says why.
        </p>
      </section>

      {envFields.length > 0 && (
        <section>
          <h3 className="vs-section-title vs-muted">Per-environment overrides</h3>
          <p className="vs-muted vs-small" style={{ margin: '0 0 8px' }}>
            Set these in a Voiden environment to point it somewhere else, e.g. staging at a different project. Put credentials
            only in a <strong>private</strong> environment; public ones are committed to Git.
          </p>
          <table className="vs-table">
            <tbody>
              {envFields.map((f) => (
                <tr key={f.key}>
                  <td style={{ width: '1%', whiteSpace: 'nowrap' }}><CopyCode text={f.env!} toast={toast} /></td>
                  <td className="vs-muted">
                    {f.label}
                    {f.type === 'secret' && <span className="vs-small"> · credential</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <a className="vs-row vs-small" href={info.docsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--button-primary-bg)' }}>
        {info.name} documentation <Icon name="external" size={12} />
      </a>
    </div>
  );
}
