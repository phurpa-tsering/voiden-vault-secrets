/**
 * Main-process entry for Vault Secrets.
 *
 * Registers one variable provider per secret manager — {{vault.*}},
 * {{doppler.*}}, {{infisical.*}}, {{bitwarden.*}}, {{keepass.*}} — resolved
 * when a request is sent, in the main process, so secret values never reach
 * the renderer or the project's files.
 *
 * IPC channels (auto-namespaced by Voiden as `ext:voiden-vault-secrets:<name>`):
 *   get-config, save-provider, save-general, test-connection, browse, action,
 *   clear-cache, pick-file
 * Events sent to the renderer:
 *   resolve-error  { provider, reference, message }
 *   status         { provider, status }
 */

import type { ElectronExtensionContext, ElectronPlugin } from '@voiden/sdk/electron';
import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProviderId, PROVIDERS, providerInfo, type ProviderId } from './catalog';
import { createConfigStore } from './configStore';
import { execFile } from './exec';
import type { FetchLike } from './http';
import { bitwardenProvider } from './providers/bitwarden';
import { dopplerProvider } from './providers/doppler';
import { createInfisicalProvider } from './providers/infisical';
import { createKeepassProvider, keepassCliCandidates } from './providers/keepass';
import { vaultProvider } from './providers/vault';
import { createSecretsService } from './service';
import type { BrowseResult, Draft, TestResult } from './types';

type VariableResolver = (key: string, context: { env: Readonly<Record<string, string>> }) => Promise<string | undefined>;
type EnvWithProviders = ElectronExtensionContext['env'] & {
  registerVariableProvider?: (namespace: string, resolve: VariableResolver) => () => void;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const errorCode = (error: unknown) => (error as { code?: string })?.code;

const expandPath = (p: string) => path.resolve(p.trim().replace(/^~(?=$|[\\/])/, os.homedir()));

function assertProvider(id: unknown): ProviderId {
  if (!isProviderId(id)) throw new Error(`Unknown secret provider "${String(id)}"`);
  return id;
}

export default function createVaultSecretsMainPlugin(ctx: ElectronExtensionContext): ElectronPlugin {
  const disposers: (() => void)[] = [];

  return {
    onload() {
      const store = createConfigStore();
      const service = createSecretsService({
        store,
        fetch: globalThis.fetch as unknown as FetchLike,
        exec: execFile,
        providers: {
          vault: vaultProvider,
          doppler: dopplerProvider,
          infisical: createInfisicalProvider(),
          bitwarden: bitwardenProvider,
          keepass: createKeepassProvider({
            expandPath,
            findCli: () => keepassCliCandidates(process.platform, process.env).find((p) => fs.existsSync(p)) ?? 'keepassxc-cli',
          }),
        },
        onStatus: (provider, status) => ctx.ipc.send('status', { provider, status }),
      });

      const env = ctx.env as EnvWithProviders;
      const providerApiAvailable = typeof env.registerVariableProvider === 'function';
      if (!providerApiAvailable) {
        console.warn('[voiden-vault-secrets] This Voiden version has no variable provider API — secret references will not resolve. Update Voiden.');
      } else {
        for (const { id, namespace } of PROVIDERS) {
          try {
            disposers.push(
              env.registerVariableProvider!(namespace, async (key, context) => {
                try {
                  return await service.resolve(id, key, context.env);
                } catch (error) {
                  // Tell the UI why, so the user sees more than "unresolved variable".
                  ctx.ipc.send('resolve-error', { provider: id, reference: `{{${namespace}.${key}}}`, message: errorMessage(error) });
                  throw error;
                }
              }),
            );
          } catch (error) {
            // Another plugin owns this namespace; the other providers still work.
            console.warn(`[voiden-vault-secrets] Couldn't register {{${namespace}.*}}: ${errorMessage(error)}`);
          }
        }
      }

      const describe = () => ({ ...store.describe(), providerApiAvailable, status: service.getStatus() });

      ctx.ipc.handle('get-config', describe);

      ctx.ipc.handle('save-provider', (_event, id: unknown, settings?: Record<string, string>, secrets?: Record<string, string | null>) => {
        store.saveProvider(assertProvider(id), settings, secrets);
        service.clearCache();
        return describe();
      });

      ctx.ipc.handle('save-general', (_event, general: { cacheTtlSeconds?: number }) => {
        store.saveGeneral(general ?? {});
        service.clearCache();
        return describe();
      });

      // Tests the draft from the settings page (environment overrides aren't known here).
      ctx.ipc.handle('test-connection', async (_event, id: unknown, draft?: Draft): Promise<TestResult> => {
        try {
          return { ok: true, ...(await service.test(assertProvider(id), draft)) };
        } catch (error) {
          return { ok: false, message: errorMessage(error), code: errorCode(error) };
        }
      });

      ctx.ipc.handle('browse', async (_event, id: unknown, parent?: string, draft?: Draft): Promise<BrowseResult> => {
        try {
          return { ok: true, entries: await service.browse(assertProvider(id), parent, draft) };
        } catch (error) {
          return { ok: false, message: errorMessage(error), code: errorCode(error) };
        }
      });

      ctx.ipc.handle('action', async (_event, id: unknown, name: string, arg?: string, draft?: Draft) => {
        try {
          return { ok: true, message: await service.action(assertProvider(id), name, arg, draft) };
        } catch (error) {
          return { ok: false, message: errorMessage(error) };
        }
      });

      ctx.ipc.handle('clear-cache', () => {
        service.clearCache();
        return true;
      });

      ctx.ipc.handle('pick-file', async (_event, id: unknown, fieldKey: string) => {
        const field = providerInfo(assertProvider(id)).fields.find((f) => f.key === fieldKey);
        const options = {
          title: field ? `Choose ${field.label.toLowerCase()}` : 'Choose a file',
          properties: ['openFile' as const, 'showHiddenFiles' as const],
          filters: field?.extensions ? [{ name: field.label, extensions: field.extensions }, { name: 'All files', extensions: ['*'] }] : undefined,
        };
        const window = BrowserWindow.getFocusedWindow();
        const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
        return result.canceled ? null : result.filePaths[0] ?? null;
      });
    },

    onunload() {
      for (const dispose of disposers.splice(0)) dispose();
    },
  };
}
