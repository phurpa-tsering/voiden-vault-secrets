# Vault Secrets for Voiden

Use secrets from [HashiCorp Vault](https://www.vaultproject.io/) in your Voiden requests without storing them in your project.

```
Authorization: Bearer {{vault.myapp/api#token}}
```

Secrets are read from Vault when a request is sent, in Voiden's main process. They never reach the editor UI, the project's files, or Git.

> **Requires a Voiden version with the plugin variable provider API** (`env.registerVariableProvider`). On older versions the plugin loads, but `{{vault.*}}` references stay unresolved and the settings page shows a warning.

## Setup

1. Install the plugin, then click the key icon in the top bar to open **Vault Secrets**.
2. Enter your **Vault address** and a **token**, then **Save** and **Test connection**.

The token is encrypted with your OS keychain (macOS Keychain, Windows DPAPI, libsecret on Linux). If OS encryption isn't available, the token is kept in memory until Voiden quits and is never written to disk in plain text.

| Setting | Default | |
|---|---|---|
| Vault address | — | e.g. `https://vault.example.com:8200` |
| Token | — | needs `read` on the secrets you reference |
| KV mount | `secret` | |
| KV version | v2 | v1 is supported too |
| Namespace | — | Vault Enterprise / HCP only |
| Default secret path | — | used by bare references like `{{vault.api_key}}` |
| Cache | 60 s | how long a secret is reused before it's read again; `0` turns caching off |

## Reference syntax

| Reference | Reads |
|---|---|
| `{{vault.myapp/db#password}}` | field `password` of secret `myapp/db` |
| `{{vault.myapp/api_key}}` | field `api_key` of secret `myapp` |
| `{{vault.api_key}}` | field `api_key` of the default secret path |

`#` always marks the field. Without it, the last path segment is the field.

If a secret can't be read (no access, field missing, Vault unreachable), Voiden blocks the request as having an unresolved variable, and a toast explains what went wrong. Nothing is sent with a placeholder in it.

## Per-environment Vaults

These variables in the active Voiden environment override the saved settings:

| Variable | Overrides |
|---|---|
| `VAULT_ADDR` | Vault address |
| `VAULT_TOKEN` | token |
| `VAULT_NAMESPACE` | namespace |
| `VAULT_MOUNT` | KV mount |

For example, `staging` can point at a different Vault than `dev`. Keep `VAULT_TOKEN` in a **private** environment, never a public one.

## Development

```bash
npm install
npm test          # unit tests
npm run build     # dist/voiden-vault-secrets.js + dist/voiden-vault-secrets-main.cjs
npm run zip       # dist/voiden-vault-secrets.zip
```

To develop it live, open this folder as a project in Voiden, turn on **Plugin Dev Mode** (puzzle icon), and press **Run**.

To install the zip: **Extensions → ⋯ → Install from file → `dist/voiden-vault-secrets.zip`**.

| File | |
|---|---|
| `src/main-process.ts` | registers the `vault` provider and the settings IPC handlers |
| `src/resolver.ts` | reference → secret value, with caching and environment overrides |
| `src/vaultClient.ts` | Vault HTTP calls (KV v1/v2, token lookup) |
| `src/configStore.ts` | settings and encrypted token storage |
| `src/plugin.ts`, `src/SettingsPage.tsx` | top-bar button, settings tab, `{{vault.*}}` highlighting, error toasts |

## Roadmap

- Doppler and Infisical providers
- A secret path browser
- Other auth methods (AppRole, OIDC)

## License

Apache-2.0
