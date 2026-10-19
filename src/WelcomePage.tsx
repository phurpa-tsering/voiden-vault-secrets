import { useState } from 'react';
import type { CorePluginContext } from '@voiden/sdk/ui';

type Manifest = { id: string; name: string; version: string; description?: string };

// Colours come from context.theme (Tailwind classes mapped to the active
// Voiden theme), so this page follows light/dark and custom themes.
// Layout uses inline styles so it doesn't depend on which utility classes
// the host app happens to ship.

/** Rocket mark, used for the top-bar button, the tab and the page logo.
 *  (Voiden's plugin dev mode uses a puzzle icon, so the starter uses something else.) */
export function PluginIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

const STEPS = [
  { title: 'Edit this page', body: 'Open src/WelcomePage.tsx and change some text.' },
  { title: 'Save and watch it reload', body: 'With live reload on (the ⚡ in the Plugin Dev toolbar), every save rebuilds and reloads the plugin.' },
  { title: 'Build something real', body: 'Register features in src/plugin.ts. README.md has examples for each API.' },
];

// Feature names only, no API identifiers: the build scans the bundle for API
// names to fill in manifest capabilities. README.md has the matching API calls.
const CAPABILITIES = [
  { feature: 'Slash commands', what: 'Insert your own blocks into .void files' },
  { feature: 'Sidebar tabs', what: 'A panel in the left or right sidebar' },
  { feature: 'Editor tabs', what: 'A full tab rendering a React component, like this one' },
  { feature: 'Command palette', what: 'Actions users can run from the palette', permission: 'commandPalette' },
  { feature: 'Workspace events', what: 'React to tab, file and project changes', permission: 'events' },
  { feature: 'Settings', what: 'A section in Voiden Settings', permission: 'settings' },
];

const join = (...classes: string[]) => classes.join(' ');

export function createWelcomePage(context: CorePluginContext, manifest: Manifest) {
  const t = context.theme;

  return function WelcomePage() {
    const [clicks, setClicks] = useState(0);

    const sayHello = () => {
      const next = clicks + 1;
      setClicks(next);
      context.ui.showToast?.('Hello from ' + manifest.name + '! (' + next + ')', 'success');
    };

    return (
      <div className={join(t.bg.editor, t.text.primary)} style={{ height: '100%', overflowY: 'auto' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
          {/* Hero */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <div className={join(t.bg.panel, t.border.DEFAULT, t.text.accent)} style={{ width: 72, height: 72, borderRadius: 18, borderWidth: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PluginIcon size={36} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{manifest.name}</h1>
              <div className={t.text.muted} style={{ fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>
                {manifest.id} · v{manifest.version}
              </div>
            </div>
            <p className={t.text.muted} style={{ fontSize: 14, margin: 0 }}>
              {manifest.description || 'Your plugin is loaded and running inside Voiden.'}
            </p>
            <button
              onClick={sayHello}
              className={join(t.button.primary, 'text-white')}
              style={{ marginTop: 4, padding: '6px 14px', borderRadius: 6, fontSize: 13, border: 'none', cursor: 'pointer' }}
            >
              Say hello{clicks > 0 ? ' (' + clicks + ')' : ''}
            </button>
          </div>

          {/* Get started */}
          <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, margin: '40px 0 12px' }} className={t.text.muted}>
            Get started
          </h2>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={join(t.bg.panel, t.border.DEFAULT)} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderStyle: 'solid' }}>
                <span className={join(t.bg.accent, 'text-black')} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{step.title}</div>
                  <div className={t.text.muted} style={{ fontSize: 12, marginTop: 2 }}>{step.body}</div>
                </div>
              </li>
            ))}
          </ol>

          {/* What a plugin can do */}
          <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, margin: '32px 0 12px' }} className={t.text.muted}>
            What a plugin can do
          </h2>
          <div className={t.border.DEFAULT} style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 8, overflow: 'hidden' }}>
            {CAPABILITIES.map((cap, i) => (
              <div key={cap.feature} className={t.border.DEFAULT} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 12px', borderStyle: 'solid', borderWidth: 0, borderTopWidth: i === 0 ? 0 : 1 }}>
                <span style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, width: 128 }}>{cap.feature}</span>
                <span className={t.text.muted} style={{ fontSize: 12, flex: 1 }}>{cap.what}</span>
                {cap.permission && (
                  <span className={join(t.bg.panel, t.text.muted)} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }} title="Add this to manifest.json permissions">
                    {cap.permission}
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className={t.text.muted} style={{ fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            README.md in your project has the full guide: project layout, the dev loop, permissions and publishing.
          </p>
        </div>
      </div>
    );
  };
}
