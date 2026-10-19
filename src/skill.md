# Vault Secrets

Resolves `{{vault.*}}` references from HashiCorp Vault when a request is sent. Values are never written into .void files.

- `{{vault.<path>#<field>}}` reads one field of a KV secret, e.g. `{{vault.myapp/db#password}}`.
- `{{vault.<path>/<field>}}`: without `#`, the last path segment is the field.
- `{{vault.<field>}}` reads from the default secret path configured in the plugin.
- `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_NAMESPACE` and `VAULT_MOUNT` in the active environment override the plugin settings.

When writing requests, put secrets behind a `{{vault.*}}` reference instead of pasting secret values into a .void file.
