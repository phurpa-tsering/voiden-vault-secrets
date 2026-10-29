/**
 * The secret providers this plugin supports and the settings each one takes.
 *
 * Pure data, shared by the main process (validation, env overrides, required
 * fields) and the settings page (which renders its forms from it).
 */

export type ProviderId = 'vault' | 'doppler' | 'infisical' | 'bitwarden' | 'keepass';

export interface FieldSpec {
  key: string;
  label: string;
  /** text: plain setting · secret: encrypted, never sent back to the UI · path: local file */
  type: 'text' | 'secret' | 'select' | 'path';
  hint?: string;
  placeholder?: string;
  default?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Environment variable that overrides this field for the active environment. */
  env?: string;
  /** Only shown (and required) when another field has this value. */
  showIf?: { key: string; equals: string };
  /** Lay out in a two-column row with its neighbour. */
  half?: boolean;
  /** File dialog filters for `path` fields. */
  extensions?: string[];
}

export interface ProviderInfo {
  id: ProviderId;
  /** Namespace of its references: {{<namespace>.…}} */
  namespace: string;
  name: string;
  tagline: string;
  /** Short reference pattern shown next to the name. */
  pattern: string;
  docsUrl: string;
  fields: FieldSpec[];
  examples: { reference: string; reads: string }[];
  /** Setup steps shown on the Usage tab; text in `backticks` renders as copyable code. */
  setup: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'vault',
    namespace: 'vault',
    name: 'HashiCorp Vault',
    tagline: 'KV v1 / v2 secrets engine',
    pattern: '{{vault.path#field}}',
    docsUrl: 'https://developer.hashicorp.com/vault/docs/secrets/kv',
    fields: [
      { key: 'address', label: 'Vault address', type: 'text', required: true, env: 'VAULT_ADDR', placeholder: 'https://vault.example.com:8200' },
      { key: 'token', label: 'Token', type: 'secret', required: true, env: 'VAULT_TOKEN', placeholder: 'hvs.…', hint: 'needs read on the secrets you reference' },
      { key: 'mount', label: 'KV mount', type: 'text', default: 'secret', env: 'VAULT_MOUNT', half: true },
      {
        key: 'kvVersion', label: 'KV version', type: 'select', default: '2', half: true,
        options: [{ value: '2', label: 'v2 (versioned)' }, { value: '1', label: 'v1' }],
      },
      { key: 'namespace', label: 'Namespace', type: 'text', env: 'VAULT_NAMESPACE', placeholder: 'admin', hint: 'Enterprise / HCP only', half: true },
      { key: 'defaultPath', label: 'Default secret path', type: 'text', placeholder: 'myapp/dev', hint: 'for {{vault.field}}', half: true },
    ],
    examples: [
      { reference: '{{vault.myapp/db#password}}', reads: 'field password of secret myapp/db' },
      { reference: '{{vault.myapp/api_key}}', reads: 'field api_key of secret myapp' },
      { reference: '{{vault.api_key}}', reads: 'field api_key of the default secret path' },
    ],
    setup: [
      'Create a token whose policy allows `read` on the paths you reference (KV v2: `secret/data/<path>`).',
      'Enter the address and token, then Save.',
    ],
  },
  {
    id: 'doppler',
    namespace: 'doppler',
    name: 'Doppler',
    tagline: 'Project configs',
    pattern: '{{doppler.NAME}}',
    docsUrl: 'https://docs.doppler.com/docs/service-tokens',
    fields: [
      { key: 'token', label: 'Token', type: 'secret', required: true, env: 'DOPPLER_TOKEN', placeholder: 'dp.st.…', hint: 'service token, or a personal token' },
      { key: 'project', label: 'Project', type: 'text', env: 'DOPPLER_PROJECT', placeholder: 'backend', hint: 'not needed with a service token', half: true },
      { key: 'config', label: 'Config', type: 'text', env: 'DOPPLER_CONFIG', placeholder: 'dev', hint: 'not needed with a service token', half: true },
    ],
    examples: [
      { reference: '{{doppler.API_KEY}}', reads: 'API_KEY from the configured project and config' },
      { reference: '{{doppler.prd/API_KEY}}', reads: 'API_KEY from config prd of the configured project' },
      { reference: '{{doppler.backend/prd/API_KEY}}', reads: 'API_KEY from project backend, config prd' },
    ],
    setup: [
      'In Doppler, open your config → Access → Generate a read-only service token.',
      'Paste it here and Save. A service token is scoped to one config, so project and config can stay empty.',
    ],
  },
  {
    id: 'infisical',
    namespace: 'infisical',
    name: 'Infisical',
    tagline: 'Machine identity or access token',
    pattern: '{{infisical.NAME}}',
    docsUrl: 'https://infisical.com/docs/documentation/platform/identities/universal-auth',
    fields: [
      { key: 'siteUrl', label: 'Infisical URL', type: 'text', default: 'https://app.infisical.com', env: 'INFISICAL_API_URL', hint: 'EU cloud or self-hosted: change this' },
      {
        key: 'authMethod', label: 'Authentication', type: 'select', default: 'universal',
        options: [{ value: 'universal', label: 'Universal Auth (machine identity)' }, { value: 'token', label: 'Access token' }],
      },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, env: 'INFISICAL_UNIVERSAL_AUTH_CLIENT_ID', showIf: { key: 'authMethod', equals: 'universal' } },
      { key: 'clientSecret', label: 'Client secret', type: 'secret', required: true, env: 'INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET', showIf: { key: 'authMethod', equals: 'universal' } },
      { key: 'accessToken', label: 'Access token', type: 'secret', required: true, env: 'INFISICAL_TOKEN', showIf: { key: 'authMethod', equals: 'token' } },
      { key: 'projectId', label: 'Project ID', type: 'text', required: true, env: 'INFISICAL_PROJECT_ID', hint: 'Project settings → Project ID' },
      { key: 'environment', label: 'Environment', type: 'text', default: 'dev', env: 'INFISICAL_ENVIRONMENT', placeholder: 'dev', hint: 'slug', half: true },
      { key: 'secretPath', label: 'Default folder', type: 'text', default: '/', env: 'INFISICAL_SECRET_PATH', placeholder: '/', half: true },
    ],
    examples: [
      { reference: '{{infisical.API_KEY}}', reads: 'API_KEY in the default folder' },
      { reference: '{{infisical.payments/STRIPE_KEY}}', reads: 'STRIPE_KEY in folder /payments' },
    ],
    setup: [
      'Create a machine identity with Universal Auth and give it read access to the project.',
      'Enter its client ID and secret, the project ID and the environment slug, then Save.',
      'Map Voiden environments to Infisical ones by setting `INFISICAL_ENVIRONMENT` in each Voiden environment.',
    ],
  },
  {
    id: 'bitwarden',
    namespace: 'bitwarden',
    name: 'Bitwarden',
    tagline: 'Password manager via bw serve',
    pattern: '{{bitwarden.Item#field}}',
    docsUrl: 'https://bitwarden.com/help/cli/#serve',
    fields: [
      { key: 'serverUrl', label: 'bw serve address', type: 'text', default: 'http://localhost:8087', env: 'BW_SERVE_URL', hint: 'the local Bitwarden CLI API' },
    ],
    examples: [
      { reference: '{{bitwarden.GitHub}}', reads: 'password of the item named GitHub' },
      { reference: '{{bitwarden.GitHub#username}}', reads: 'its username (also: totp, notes, uri)' },
      { reference: '{{bitwarden.Stripe#api_key}}', reads: 'custom field api_key of item Stripe' },
    ],
    setup: [
      'Install the Bitwarden CLI and log in: `bw login`',
      'Start the local API and leave it running: `bw serve --port 8087`',
      'Unlock it from the Connection tab (your master password is sent to bw serve only, never stored).',
    ],
  },
  {
    id: 'keepass',
    namespace: 'keepass',
    name: 'KeePassXC',
    tagline: 'Local .kdbx database',
    pattern: '{{keepass.Group/Entry#attr}}',
    docsUrl: 'https://keepassxc.org/docs/KeePassXC_UserGuide#_command_line_tool',
    fields: [
      { key: 'databasePath', label: 'Database file', type: 'path', required: true, placeholder: '~/Passwords.kdbx', extensions: ['kdbx'] },
      { key: 'password', label: 'Database password', type: 'secret', env: 'KEEPASS_PASSWORD', hint: 'empty if you only use a key file' },
      { key: 'keyFilePath', label: 'Key file', type: 'path', placeholder: 'optional', half: true },
      { key: 'cliPath', label: 'keepassxc-cli', type: 'path', placeholder: 'auto-detected', half: true },
    ],
    examples: [
      { reference: '{{keepass.Dev/GitHub}}', reads: 'password of entry GitHub in group Dev' },
      { reference: '{{keepass.Dev/GitHub#UserName}}', reads: 'its username (also: URL, Notes, TOTP, custom attributes)' },
    ],
    setup: [
      'Install KeePassXC; it ships the `keepassxc-cli` tool this uses.',
      'Choose your .kdbx file and enter its password and/or key file, then Save.',
    ],
  },
];

export const providerInfo = (id: ProviderId): ProviderInfo => {
  const info = PROVIDERS.find((p) => p.id === id);
  if (!info) throw new Error(`Unknown secret provider "${id}"`);
  return info;
};

export const isProviderId = (value: unknown): value is ProviderId => PROVIDERS.some((p) => p.id === value);

/** Fields that apply given the current values (showIf resolved). */
export function visibleFields(info: ProviderInfo, values: Record<string, string>): FieldSpec[] {
  return info.fields.filter((f) => !f.showIf || (values[f.showIf.key] || defaultOf(info, f.showIf.key)) === f.showIf.equals);
}

const defaultOf = (info: ProviderInfo, key: string) => info.fields.find((f) => f.key === key)?.default ?? '';

/** Keep only the provider's known non-secret settings, trimmed, with defaults filled in. */
export function sanitizeSettings(id: ProviderId, input: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of providerInfo(id).fields) {
    if (field.type === 'secret') continue;
    let value = String(input[field.key] ?? '').trim();
    if (field.options && !field.options.some((o) => o.value === value)) value = '';
    out[field.key] = value || field.default || '';
  }
  return out;
}
