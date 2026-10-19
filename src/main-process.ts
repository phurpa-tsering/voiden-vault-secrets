import { ipcMain } from 'electron';

/**
 * Main-process entry for Vault Secrets.
 * Register IPC handlers here. This file is bundled separately via build-main.mjs.
 */
export function register() {
  ipcMain.handle('voiden-vault-secrets:example', async (_event, payload: any) => {
    return { ok: true, payload };
  });
}
