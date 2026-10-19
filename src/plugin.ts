import type { CorePluginContext } from '@voiden/sdk/ui';
// import { Node, mergeAttributes } from '@tiptap/core'; // uncomment if using custom blocks
// import React from 'react';                            // uncomment if using sidebar
import manifest from '../manifest.json';
import { createWelcomePage, PluginIcon } from './WelcomePage';

type PluginContext = CorePluginContext;

// Tabs are de-duplicated by id: opening the welcome tab again just focuses it.
const WELCOME_TAB_ID = 'voiden-vault-secrets-welcome';
const WELCOMED_KEY = 'voiden-vault-secrets:welcomed';

export default function createVoidenVaultSecretsPlugin(context: PluginContext) {

  // Created once, so registerPanel and addTab hand Voiden the same component.
  const WelcomePage = createWelcomePage(context, manifest);
  const openWelcome = () =>
    context.addTab('main', {
      id: WELCOME_TAB_ID,
      title: manifest.name,
      icon: 'Rocket', // lucide icon name, shown in the tab bar (matches PluginIcon)
      props: {},
      component: WelcomePage,
    });

  return {
    onload: async () => {

      // ── Starter: top-bar button + welcome tab ─────────────────────────────
      // Register the welcome tab's component on every load. Voiden clears plugin
      // components whenever plugins reload (live reload, Rebuild), so a tab that's
      // already open would otherwise show "Panel component not available".
      context.registerPanel('main', {
        id: WELCOME_TAB_ID,
        title: manifest.name,
        icon: 'Rocket',
        component: WelcomePage,
      });

      // A button in the top bar that opens the welcome tab (src/WelcomePage.tsx).
      context.registerTopBarItem({
        id: 'voiden-vault-secrets.topbar',
        icon: PluginIcon,
        tooltip: manifest.name,
        onClick: openWelcome,
      });

      // Show the welcome tab once per session so you can see the plugin is
      // running. Plugins are reloaded together, so this avoids stealing focus
      // on every reload. Remove it once you've built something of your own.
      if (!sessionStorage.getItem(WELCOMED_KEY)) {
        sessionStorage.setItem(WELCOMED_KEY, '1');
        openWelcome();
      }

      // ── Custom TipTap block node ──────────────────────────────────────────
      // const MyNode = Node.create({
      //   name: 'voiden-vault-secrets',
      //   group: 'block',
      //   atom: true,
      //   addAttributes() { return { label: { default: '' } }; },
      //   parseHTML() { return [{ tag: 'div[data-type="voiden-vault-secrets"]' }]; },
      //   renderHTML({ HTMLAttributes }) {
      //     return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'voiden-vault-secrets' })];
      //   },
      // });
      // context.registerVoidenExtension(MyNode);

      // ── Slash command ─────────────────────────────────────────────────────
      // context.addVoidenSlashGroup({
      //   name: 'voiden-vault-secrets',
      //   title: 'Vault Secrets',
      //   commands: [{
      //     name: 'voiden-vault-secrets',
      //     label: 'Insert Vault Secrets',
      //     slash: '/voiden-vault-secrets',
      //     description: 'Insert a Vault Secrets block',
      //     action: (editor) => editor?.chain().focus().insertContent({ type: 'voiden-vault-secrets' }).run(),
      //   }],
      // });

      // ── Sidebar tab ───────────────────────────────────────────────────────
      // const SidebarView = () => React.createElement('div', { style: { padding: 16 } }, 'Vault Secrets');
      // context.registerSidebarTab('right', { id: 'voiden-vault-secrets', title: 'Vault Secrets', icon: null, component: SidebarView });

      // ── Request pipeline ──────────────────────────────────────────────────
      // Hooks run in order: PreProcessing → RequestCompilation → PreSend → PostProcessing
      //
      // Stage 1 — PreProcessing  { editor, requestState, cancel }
      //   Validate or cancel before the request is built. editor is available here.
      // context.pipeline.addHook(PipelineStage.PreProcessing, ({ editor, requestState, cancel }) => {
      //   if (!requestState.url) cancel(); // abort if no URL
      // });
      //
      // Stage 2 — RequestCompilation  { editor, requestState, addHeader, addQueryParam }
      //   Compile editor content into the request. editor is available here.
      //   addHeader / addQueryParam are convenience helpers that push into requestState.
      // context.pipeline.addHook(PipelineStage.RequestCompilation, ({ editor, requestState, addHeader, addQueryParam }) => {
      //   addHeader('X-Plugin-Id', 'voiden-vault-secrets');
      //   addQueryParam('source', 'voiden-vault-secrets');
      // });
      //
      // Stage 3 — PreSend  { requestState, metadata }
      //   Last chance to modify the request before it is sent. No editor here.
      // context.pipeline.addHook(PipelineStage.PreSend, ({ requestState, metadata }) => {
      //   metadata.sentAt = Date.now();
      //   requestState.headers.push({ key: 'X-Sent-By', value: 'voiden-vault-secrets', enabled: true });
      // });
      //
      // Stage 4 — PostProcessing  { requestState, responseState, metadata }
      //   Inspect or transform the response after it is received. No editor here.
      // context.pipeline.addHook(PipelineStage.PostProcessing, ({ requestState, responseState, metadata }) => {
      //   const duration = Date.now() - (metadata.sentAt ?? 0);
      //   console.log(`[voiden-vault-secrets] ${requestState.method} → ${responseState.status} (${duration}ms)`);
      // });

      // Permission: settings
      // const value = await context.settings.get<string>('my-key');
      // await context.settings.set('my-key', 'value');

      // context.ui.registerSettings({
      //   id: 'voiden-vault-secrets-settings',
      //   title: 'Vault Secrets Settings',
      //   fields: [
      //     { type: 'toggle', key: 'enabled', label: 'Enable feature', defaultValue: true },
      //     { type: 'text',   key: 'apiKey',  label: 'API Key', placeholder: 'sk-...' },
      //     { type: 'number', key: 'timeout', label: 'Timeout (ms)', defaultValue: 5000, min: 0 },
      //     { type: 'select', key: 'mode',    label: 'Mode',
      //       options: [{ label: 'Fast', value: 'fast' }, { label: 'Accurate', value: 'accurate' }],
      //       defaultValue: 'fast' },
      //   ],
      // });
    },

    onunload: async () => {
      
    },

    metadata: manifest,
  };
}
