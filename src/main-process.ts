/**
 * Main-process entry for Vault Secrets.
 *
 * Registers the "vault" variable provider so `{{vault.*}}` references are
 * resolved from HashiCorp Vault when a request is sent — in the main process,
 * so secret values never reach the renderer or the project's files.
 *
 * IPC channels (auto-namespaced by Voiden as `ext:voiden-vault-secrets:<name>`):
 *   get-config, save-config, test-connection, clear-cache
 * Events sent to the renderer:
 *   resolve-error  { reference, message }
 */

import type { ElectronExtensionContext, ElectronPlugin } from '@voiden/sdk/electron';
import { createConfigStore } from './configStore';
import { createVaultResolver, ENV_OVERRIDES, type VaultSettings } from './resolver';
import { lookupSelf, type FetchLike } from './vaultClient';

const NAMESPACE = 'vault';

type VariableResolver = (key: string, context: { env: Readonly<Record<string, string>> }) => Promise<string | undefined>;
type EnvWithProviders = ElectronExtensionContext['env'] & {
  registerVariableProvider?: (namespace: string, resolve: VariableResolver) => () => void;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function createVaultSecretsMainPlugin(ctx: ElectronExtensionContext): ElectronPlugin {
  let disposeProvider: (() => void) | undefined;

  return {
    onload() {
      const store = createConfigStore();
      const fetchImpl = globalThis.fetch as unknown as FetchLike;
      const resolver = createVaultResolver({
        getSettings: store.getSettings,
        getToken: store.getToken,
        fetch: fetchImpl,
      });

      const env = ctx.env as EnvWithProviders;
      if (typeof env.registerVariableProvider !== 'function') {
        console.warn('[voiden-vault-secrets] This Voiden version has no variable provider API — {{vault.*}} references will not resolve. Update Voiden.');
      } else {
        disposeProvider = env.registerVariableProvider(NAMESPACE, async (key, context) => {
          try {
            return await resolver.resolve(key, context.env);
          } catch (error) {
            // Tell the UI why, so the user sees more than "unresolved variable".
            ctx.ipc.send('resolve-error', { reference: `{{${NAMESPACE}.${key}}}`, message: errorMessage(error) });
            throw error;
          }
        });
      }

      ctx.ipc.handle('get-config', () => ({
        ...store.describe(),
        providerAvailable: typeof env.registerVariableProvider === 'function',
        envOverrides: ENV_OVERRIDES,
      }));

      ctx.ipc.handle('save-config', (_event, settings: Partial<VaultSettings>, token?: string | null) => {
        store.save(settings ?? {}, token);
        resolver.clearCache();
        return store.describe();
      });

      // Uses the saved settings (environment overrides aren't known here).
      ctx.ipc.handle('test-connection', async () => {
        const { address, namespace } = store.getSettings();
        if (!address) return { ok: false, message: 'Set a Vault address first.' };
        try {
          const info = await lookupSelf(fetchImpl, { address, namespace, token: store.getToken() ?? '' });
          return { ok: true, ...info };
        } catch (error) {
          return { ok: false, message: errorMessage(error) };
        }
      });

      ctx.ipc.handle('clear-cache', () => {
        resolver.clearCache();
        return true;
      });
    },

    onunload() {
      disposeProvider?.();
      disposeProvider = undefined;
    },
  };
}
