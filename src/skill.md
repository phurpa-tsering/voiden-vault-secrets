# Vault Secrets

Resolves secret references from external secret managers when a request is sent. Values are never written into .void files.

- `{{vault.<path>#<field>}}`: HashiCorp Vault KV field, e.g. `{{vault.myapp/db#password}}`. Without `#`, the last path segment is the field; a bare name reads the default secret path.
- `{{doppler.NAME}}`: Doppler secret from the configured config; `{{doppler.<config>/NAME}}` or `{{doppler.<project>/<config>/NAME}}` pick another config.
- `{{infisical.NAME}}`: Infisical secret in the default folder; `{{infisical.<folder>/NAME}}` reads another folder.
- `{{bitwarden.<item>}}`: password of a Bitwarden item; `#username`, `#totp`, `#notes`, `#uri` or `#<custom field>` read other fields. Use the item id when names are ambiguous.
- `{{keepass.<Group/Entry>}}`: password of a KeePassXC entry; `#UserName`, `#URL`, `#Notes`, `#TOTP` or a custom attribute read other fields.
- Variables in the active environment override plugin settings, e.g. `VAULT_ADDR`, `VAULT_TOKEN`, `DOPPLER_TOKEN`, `DOPPLER_CONFIG`, `INFISICAL_ENVIRONMENT`.

When writing requests, put secrets behind one of these references instead of pasting secret values into a .void file.
