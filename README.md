# Vault Secrets

Resolve {{vault.*}} secrets from HashiCorp Vault at request time, so they never live in your project files

A [Voiden](https://voiden.md) plugin, scaffolded with [`@voiden/create-plugin`](https://github.com/VoidenHQ/create-plugin).

## Getting started

```sh
npm install
```

Then load it into Voiden in one of two ways.

**Plugin Dev Mode (recommended while developing)**

1. Open this folder as a project in Voiden.
2. Click the **puzzle icon** in the top bar. A floating dev toolbar appears.
3. Press **Run** (▶). Voiden builds the plugin and loads it.
4. A welcome tab opens. That's `src/WelcomePage.tsx` running inside Voiden.

With **live reload** on (⚡, the default), every save rebuilds and reloads the plugin. **Rebuild** (⟳) does it on demand, **Stop** (■) unloads it, and **Show details** shows the build log.

**Install from a zip**

```sh
npm run build
npm run zip
```

In Voiden: **Extensions → ⋯ → Install from file → `dist/voiden-vault-secrets.zip`**.

React, `@voiden/sdk` and the editor libraries are provided by Voiden at runtime. `build.mjs` maps those imports to Voiden's copies, so they're never bundled.

## Project layout

```
manifest.json            Plugin id, name, version, permissions (read by Voiden)
changelog.json           Release history, shown in the extension details panel
package.json             Scripts and dev dependencies
build.mjs                Renderer bundle: src/plugin.ts → dist/voiden-vault-secrets.js
build-main.mjs           Main-process bundle (skipped if src/main-process.ts is absent)
zip.mjs                  Packages dist/ into an installable zip
generate-manifest.mjs    Writes dist/manifest.json for releases (inlines a local icon)
.github/workflows/
  release.yml            Builds and publishes a GitHub release when you push a v* tag
src/
  plugin.ts              Entry point: onload / onunload
  WelcomePage.tsx        Example React component shown in a tab
  skill.md               Describes the plugin to Voiden's AI features
```

## How a plugin works

`src/plugin.ts` default-exports a function. Voiden calls it with a `context` object and expects `onload`, `onunload` and `metadata` back. Everything your plugin adds to Voiden goes through `context`.

The starter does two things in `onload`:

- registers a **top-bar button** (`context.registerTopBarItem`)
- opens a **welcome tab** (`context.addTab`) rendering `src/WelcomePage.tsx`

Replace those with your own features. The commented examples in `src/plugin.ts` cover custom blocks, slash commands, sidebar tabs and request pipeline hooks.

## Examples

### A tab with a React component

```tsx
context.addTab('main', {
  id: 'voiden-vault-secrets-tab',              // same id = focus the existing tab
  title: 'My Tab',
  icon: 'Rocket',                // lucide icon name (or an icon component), shown on the tab
  props: {},
  component: MyComponent,
});
```

Open tabs survive a plugin reload (live reload, Rebuild), but their components don't. Register the component in `onload` as well, with the same id, so an open tab keeps rendering instead of showing "Panel component not available":

```ts
context.registerPanel('main', { id: 'my-plugin-tab', title: 'My Tab', icon: 'Rocket', component: MyComponent });
```

### A sidebar tab

```ts
context.registerSidebarTab('right', {
  id: 'voiden-vault-secrets-sidebar',
  title: 'My Panel',
  icon: 'Rocket',                // any lucide-react icon name
  component: MyPanel,
});
```

### Slash commands in .void files

```ts
context.addVoidenSlashGroup({
  name: 'voiden-vault-secrets',
  title: 'Vault Secrets',
  commands: [
    {
      name: 'hello',
      slash: '/hello',
      label: 'Insert hello',
      description: 'Insert a hello paragraph',
      action: (editor) => editor.chain().focus().insertContent('Hello!').run(),
    },
  ],
});
```

### Command palette (needs the `commandPalette` permission)

```ts
context.registerCommand({
  id: 'voiden-vault-secrets.say-hello',
  label: 'Vault Secrets: Say hello',
  action: () => context.ui.showToast?.('Hello!', 'info'),
});
```

### Workspace events (needs the `events` permission)

```ts
const off = context.events.on('tab:changed', ({ tabId }) => console.log(tabId));
// call off() in onunload
```

### Theme-aware styling

`context.theme` holds class names that follow the user's theme, for example `context.theme.bg.panel`, `context.theme.text.muted` and `context.theme.button.primary`. Use them instead of hard-coded colours. `src/WelcomePage.tsx` shows them in use.

## Permissions

Some APIs only work when listed in `manifest.json` under `permissions`. Without one, the call throws and Voiden shows a "Needs Permission" badge on the plugin.

| Permission | Unlocks |
|---|---|
| `commandPalette` | `context.registerCommand` |
| `contextMenus` | `context.registerContextMenu` |
| `events` | `context.events.on` |
| `filesystem` | `context.fs.*` (files in the active project) |
| `settings` | `context.ui.registerSettings`, `context.settings.*` |

## Releasing

1. Bump `version` in `manifest.json` and `package.json`, and add an entry to `changelog.json`.
2. Commit, then tag and push:

   ```sh
   git tag v1.0.0
   git push --tags
   ```

   `.github/workflows/release.yml` builds the plugin and creates a GitHub release with `dist/voiden-vault-secrets.js`, `dist/manifest.json` and `changelog.json` attached.
3. To list the plugin in Voiden's Extensions panel, open a pull request to the [Voiden plugin registry](https://github.com/VoidenHQ/plugin-registry) adding a `"type": "community"` entry that points at your repository.
