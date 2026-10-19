import type { CorePluginContext } from '@voiden/sdk/ui';
import manifest from '../manifest.json';
import { createSettingsPage, VaultIcon } from './SettingsPage';

type PluginContext = CorePluginContext & {
  // On the plugin context, but not yet in the published SDK types.
  registerVariableHighlighter?: (rule: { prefix: string; label: string; color: string; bgColor?: string }) => void;
};

// Tabs are de-duplicated by id: opening the settings tab again just focuses it.
const SETTINGS_TAB_ID = 'voiden-vault-secrets-settings';
const RESOLVE_ERROR_CHANNEL = 'ext:voiden-vault-secrets:resolve-error';

export default function createVoidenVaultSecretsPlugin(context: PluginContext) {
  // Created once, so registerPanel and addTab hand Voiden the same component.
  const SettingsPage = createSettingsPage(context);
  const openSettings = () =>
    context.addTab('main', {
      id: SETTINGS_TAB_ID,
      title: 'Vault Secrets',
      icon: 'KeyRound',
      props: {},
      component: SettingsPage,
    });

  // A failed lookup blocks the request as an "unresolved variable"; this toast
  // says why (permission denied, field not found, Vault unreachable, …).
  // Several references failing at once shouldn't stack identical toasts.
  const recentErrors = new Map<string, number>();
  const onResolveError = (_event: unknown, payload: { reference: string; message: string }) => {
    const key = `${payload.reference}\u0000${payload.message}`;
    const now = Date.now();
    if ((recentErrors.get(key) ?? 0) > now - 3000) return;
    recentErrors.set(key, now);
    context.ui.showToast?.(`Vault: ${payload.reference} — ${payload.message}`, 'error');
  };

  return {
    onload: async () => {
      // Re-register on every load: Voiden clears plugin components when
      // plugins reload, so an open tab would otherwise lose its component.
      context.registerPanel('main', {
        id: SETTINGS_TAB_ID,
        title: 'Vault Secrets',
        icon: 'KeyRound',
        component: SettingsPage,
      });

      context.registerTopBarItem({
        id: 'voiden-vault-secrets.topbar',
        icon: VaultIcon,
        tooltip: 'Vault Secrets',
        onClick: openSettings,
      });

      // Highlight {{vault.*}} distinctly from environment variables.
      context.registerVariableHighlighter?.({ prefix: 'vault', label: 'Vault secret', color: '#f5a524' });

      (window as any).electron?.ipc?.on(RESOLVE_ERROR_CHANNEL, onResolveError);
    },

    onunload: async () => {
      (window as any).electron?.ipc?.removeListener(RESOLVE_ERROR_CHANNEL, onResolveError);
    },

    metadata: manifest,
  };
}
