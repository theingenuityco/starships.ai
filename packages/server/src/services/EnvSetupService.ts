import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type EnvGroup =
  | 'core'
  | 'database'
  | 'llm'
  | 'redis'
  | 'auth'
  | 'email'
  | 'storage'
  | 'analytics'
  | 'push'
  | 'misc';

export interface EnvVarDef {
  key: string;
  group: EnvGroup;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  placeholder?: string;
  needsRestart: boolean;
}

export interface EnvVarState extends EnvVarDef {
  isSet: boolean;
  maskedValue: string | null;
}

export interface EnvGroupState {
  id: EnvGroup;
  label: string;
  vars: EnvVarState[];
}

const GROUP_LABELS: Record<EnvGroup, string> = {
  core: 'Core',
  database: 'Database',
  llm: 'LLM Providers',
  redis: 'Redis / Queue',
  auth: 'Authentication & OAuth',
  email: 'Email (AWS SES)',
  storage: 'File Storage (AWS S3)',
  analytics: 'Analytics & Monitoring',
  push: 'Web Push Notifications',
  misc: 'Advanced / Misc',
};

export const ENV_VAR_DEFINITIONS: EnvVarDef[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    key: 'PUBLIC_URL',
    group: 'core',
    description: 'Publicly accessible URL of this instance (e.g. https://app.example.com)',
    required: false,
    sensitive: false,
    default: 'http://localhost:8080',
    needsRestart: true,
  },
  {
    key: 'CLIENT_URL',
    group: 'core',
    description: 'Internal URL of the Next.js client process',
    required: true,
    sensitive: false,
    default: 'http://localhost:3000',
    needsRestart: true,
  },
  {
    key: 'SERVER_URL',
    group: 'core',
    description: 'Internal URL of the Express API server',
    required: true,
    sensitive: false,
    default: 'http://localhost:4000',
    needsRestart: true,
  },
  {
    key: 'DOCS_URL',
    group: 'core',
    description: 'Internal URL of the documentation site',
    required: true,
    sensitive: false,
    default: 'http://localhost:3001',
    needsRestart: true,
  },
  {
    key: 'JWT_SECRET',
    group: 'core',
    description: 'Secret used to sign JWT tokens — must be at least 32 characters',
    required: true,
    sensitive: true,
    needsRestart: true,
  },
  {
    key: 'SERVER_PORT',
    group: 'core',
    description: 'Port for the Express API server',
    required: false,
    sensitive: false,
    default: '4000',
    needsRestart: true,
  },
  {
    key: 'CLIENT_PORT',
    group: 'core',
    description: 'Port for the Next.js client',
    required: false,
    sensitive: false,
    default: '3000',
    needsRestart: true,
  },
  {
    key: 'PROXY_PORT',
    group: 'core',
    description: 'Port for the reverse proxy (unified entry point)',
    required: false,
    sensitive: false,
    default: '8080',
    needsRestart: true,
  },

  // ── Database ──────────────────────────────────────────────────────────────
  {
    key: 'POSTGRES_PASSWORD',
    group: 'database',
    description: 'PostgreSQL password',
    required: true,
    sensitive: true,
    needsRestart: true,
  },
  {
    key: 'POSTGRES_HOST',
    group: 'database',
    description: 'PostgreSQL host',
    required: false,
    sensitive: false,
    default: 'localhost',
    needsRestart: true,
  },
  {
    key: 'POSTGRES_PORT',
    group: 'database',
    description: 'PostgreSQL port',
    required: false,
    sensitive: false,
    default: '5432',
    needsRestart: true,
  },
  {
    key: 'POSTGRES_USER',
    group: 'database',
    description: 'PostgreSQL username',
    required: false,
    sensitive: false,
    default: 'postgres',
    needsRestart: true,
  },
  {
    key: 'POSTGRES_DATABASE',
    group: 'database',
    description: 'PostgreSQL database name',
    required: false,
    sensitive: false,
    default: 'starships',
    needsRestart: true,
  },
  {
    key: 'POSTGRES_SSL',
    group: 'database',
    description: 'Enable SSL for PostgreSQL connections (true/false)',
    required: false,
    sensitive: false,
    default: 'false',
    needsRestart: true,
  },
  {
    key: 'POSTGRES_INTERNAL_HOST',
    group: 'database',
    description: 'Optional override for fat-container deployments where PostgreSQL runs in the same pod',
    required: false,
    sensitive: false,
    needsRestart: true,
  },

  // ── LLM Providers ─────────────────────────────────────────────────────────
  {
    key: 'OPENROUTER_API_KEY',
    group: 'llm',
    description: 'OpenRouter API key — used for all LLM calls in autopilot workflows',
    required: true,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'AVATAR_GENERATION_MODE',
    group: 'llm',
    description: 'Avatar generation pipeline: "3d" (game-character style) or "2d" (anime style)',
    required: false,
    sensitive: false,
    default: '3d',
    needsRestart: false,
  },
  {
    key: 'AWS_BEDROCK_ACCESS_KEY_ID',
    group: 'llm',
    description: 'AWS access key ID for Bedrock LLM access',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'AWS_BEDROCK_SECRET_ACCESS_KEY',
    group: 'llm',
    description: 'AWS secret access key for Bedrock LLM access',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'AWS_BEDROCK_REGION',
    group: 'llm',
    description: 'AWS region for Bedrock (e.g. us-east-1)',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'AZURE_AI_FOUNDRY_API_KEY',
    group: 'llm',
    description: 'Azure AI Foundry API key',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'AZURE_AI_FOUNDRY_ENDPOINT',
    group: 'llm',
    description: 'Azure AI Foundry endpoint URL',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'AZURE_AI_FOUNDRY_API_VERSION',
    group: 'llm',
    description: 'Azure AI Foundry API version (e.g. 2024-02-01)',
    required: false,
    sensitive: false,
    needsRestart: false,
  },

  // ── Redis ─────────────────────────────────────────────────────────────────
  {
    key: 'REDIS_HOST',
    group: 'redis',
    description: 'Redis host',
    required: false,
    sensitive: false,
    default: 'localhost',
    needsRestart: true,
  },
  {
    key: 'REDIS_PORT',
    group: 'redis',
    description: 'Redis port',
    required: false,
    sensitive: false,
    default: '6379',
    needsRestart: true,
  },
  {
    key: 'REDIS_PASSWORD',
    group: 'redis',
    description: 'Redis password (if auth is enabled)',
    required: false,
    sensitive: true,
    needsRestart: true,
  },
  {
    key: 'REDIS_DB',
    group: 'redis',
    description: 'Redis database index (default: 0)',
    required: false,
    sensitive: false,
    default: '0',
    needsRestart: true,
  },

  // ── Auth & OAuth ──────────────────────────────────────────────────────────
  {
    key: 'GOOGLE_CLIENT_ID',
    group: 'auth',
    description: 'Google OAuth app client ID (for user login via Google)',
    required: false,
    sensitive: false,
    placeholder: 'xxxxxxxxxxxxxx.apps.googleusercontent.com',
    needsRestart: false,
  },
  {
    key: 'GOOGLE_CLIENT_SECRET',
    group: 'auth',
    description: 'Google OAuth app client secret',
    required: false,
    sensitive: true,
    placeholder: 'GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx',
    needsRestart: false,
  },
  {
    key: 'GH_OAUTH_CLIENT_ID',
    group: 'auth',
    description: 'GitHub OAuth app client ID (for user login via GitHub)',
    required: false,
    sensitive: false,
    placeholder: 'Iv1.xxxxxxxxxxxxxxxx',
    needsRestart: false,
  },
  {
    key: 'GH_OAUTH_CLIENT_SECRET',
    group: 'auth',
    description: 'GitHub OAuth app client secret',
    required: false,
    sensitive: true,
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    needsRestart: false,
  },
  {
    key: 'ENCRYPTION_KEY',
    group: 'auth',
    description: 'Key for encrypting secrets stored in the database — generate with: openssl rand -hex 32',
    required: true,
    sensitive: true,
    needsRestart: false,
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  {
    key: 'ENABLE_EMAILS',
    group: 'email',
    description: 'Enable outbound email delivery via AWS SES (true/false)',
    required: false,
    sensitive: false,
    default: 'false',
    needsRestart: false,
  },
  {
    key: 'EMAIL_FROM_ADDRESS',
    group: 'email',
    description: 'Sender email address (e.g. noreply@example.com)',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'EMAIL_FROM_NAME',
    group: 'email',
    description: 'Sender display name',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'AWS_SES_REGION',
    group: 'email',
    description: 'AWS SES region (e.g. us-east-1)',
    required: false,
    sensitive: false,
    default: 'ap-south-1',
    needsRestart: false,
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    group: 'email',
    description: 'AWS access key ID (shared by SES and S3)',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    group: 'email',
    description: 'AWS secret access key (shared by SES and S3)',
    required: false,
    sensitive: true,
    needsRestart: false,
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  {
    key: 'AWS_S3_BUCKET',
    group: 'storage',
    description: 'S3 bucket name for file attachments',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'AWS_S3_REGION',
    group: 'storage',
    description: 'S3 bucket region (e.g. ap-south-1)',
    required: false,
    sensitive: false,
    default: 'ap-south-1',
    needsRestart: false,
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  {
    key: 'GA_MEASUREMENT_ID',
    group: 'analytics',
    description: 'Google Analytics 4 measurement ID (e.g. G-XXXXXXXXXX)',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'POSTHOG_KEY',
    group: 'analytics',
    description: 'PostHog project API key',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'POSTHOG_HOST',
    group: 'analytics',
    description: 'PostHog ingestion host (e.g. https://us.i.posthog.com)',
    required: false,
    sensitive: false,
    default: 'https://us.i.posthog.com',
    needsRestart: false,
  },
  {
    key: 'SENTRY_DSN_CLIENT',
    group: 'analytics',
    description: 'Sentry DSN for client-side (Next.js) error tracking',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'SENTRY_DSN_SERVER',
    group: 'analytics',
    description: 'Sentry DSN for server-side (Express) error tracking',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'ENABLE_INDEXING',
    group: 'analytics',
    description: 'Allow search engines to index this instance (true/false) — set to true only on your canonical production instance',
    required: false,
    sensitive: false,
    default: 'false',
    needsRestart: false,
  },

  // ── Push Notifications ────────────────────────────────────────────────────
  {
    key: 'VAPID_SUBJECT',
    group: 'push',
    description: 'VAPID subject URI — a mailto: or https: URL identifying the push sender',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'VAPID_PUBLIC_KEY',
    group: 'push',
    description: 'VAPID public key — generate with: web-push generate-vapid-keys',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
  {
    key: 'VAPID_PRIVATE_KEY',
    group: 'push',
    description: 'VAPID private key (keep this secret)',
    required: false,
    sensitive: true,
    needsRestart: false,
  },

  // ── Misc ──────────────────────────────────────────────────────────────────
  {
    key: 'RUNNER_URL',
    group: 'misc',
    description: 'URL of the remote autopilot runner gRPC service (leave empty to use in-process runner)',
    required: false,
    sensitive: false,
    default: 'http://localhost:50051',
    needsRestart: false,
  },
  {
    key: 'RUNNER_PORT',
    group: 'misc',
    description: 'Port for the autopilot runner service',
    required: false,
    sensitive: false,
    default: '50051',
    needsRestart: true,
  },
  {
    key: 'RUNNER_AUTH_TOKEN',
    group: 'misc',
    description: 'Bearer token for runner authentication (leave empty if auth is disabled)',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'REVALIDATE_TOKEN',
    group: 'misc',
    description: 'Shared secret for Next.js ISR on-demand revalidation',
    required: false,
    sensitive: true,
    needsRestart: false,
  },
  {
    key: 'CONNECTOR_DB_ALLOW_PRIVATE_NETWORKS',
    group: 'misc',
    description: 'Allow SQL connectors to reach private IP ranges (true/false) — only set to true in trusted environments',
    required: false,
    sensitive: false,
    default: 'false',
    needsRestart: false,
  },
  {
    key: 'CONNECTOR_DB_ALLOWED_HOSTS',
    group: 'misc',
    description: 'Comma-separated allowlist of SQL connector hosts (e.g. db.example.com,*.internal.com)',
    required: false,
    sensitive: false,
    needsRestart: false,
  },
];

const ALLOWED_KEYS = new Set(ENV_VAR_DEFINITIONS.map(d => d.key));

// Override via ENV_FILE_PATH for non-standard working directories or tests.
const ROOT_ENV_PATH = process.env.ENV_FILE_PATH ?? path.resolve(process.cwd(), '.env');

// Computed once at module load so every getEnvState() call returns the same value
// (consistent across requests and browser tabs during a single setup session).
const GENERATED_DEFAULTS: Record<string, string> = {
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
};

function maskValue(value: string): string {
  if (value.length <= 4) return '••••';
  return value.slice(0, 4) + '•'.repeat(Math.min(value.length - 4, 12));
}

export class EnvSetupService {
  getEnvState(): EnvGroupState[] {
    const groupMap = new Map<EnvGroup, EnvVarState[]>();

    for (const def of ENV_VAR_DEFINITIONS) {
      const rawValue = process.env[def.key];
      const isSet = rawValue !== undefined && rawValue.trim() !== '';
      const maskedValue = isSet ? (def.sensitive ? maskValue(rawValue!.trim()) : rawValue!.trim()) : null;

      const resolvedDefault = def.default ?? (!isSet ? GENERATED_DEFAULTS[def.key] : undefined);
      const state: EnvVarState = { ...def, default: resolvedDefault, isSet, maskedValue };

      if (!groupMap.has(def.group)) groupMap.set(def.group, []);
      groupMap.get(def.group)!.push(state);
    }

    const groups: EnvGroupState[] = [];
    for (const [id, vars] of groupMap) {
      groups.push({ id, label: GROUP_LABELS[id], vars });
    }
    return groups;
  }

  writeEnvFile(updates: Record<string, string>): { restartRequired: boolean } {
    // Validate all keys against the whitelist
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`Unknown environment variable: ${key}`);
      }
    }

    // Read existing .env if present
    let existingLines: string[] = [];
    try {
      existingLines = fs.readFileSync(ROOT_ENV_PATH, 'utf-8').split('\n');
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Build a map of key → line-index for existing key=value lines.
    // Use a strict match (no spaces around =) consistent with how we write values back.
    const keyLineIndex = new Map<string, number>();
    for (let i = 0; i < existingLines.length; i++) {
      const match = existingLines[i].match(/^([A-Z0-9_]+)=/);
      if (match) keyLineIndex.set(match[1], i);
    }

    // Apply updates: overwrite existing lines or collect new ones.
    const newLines: string[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value === '') continue; // skip empty submissions
      if (value.includes('\n')) throw new Error(`Value for ${key} must not contain newlines`);

      const formatted = `${key}=${value}`;
      if (keyLineIndex.has(key)) {
        existingLines[keyLineIndex.get(key)!] = formatted;
      } else {
        newLines.push(formatted);
      }
    }

    // Strip any trailing empty element produced by a trailing newline in the existing file,
    // then re-add a single trailing newline so the file always ends with one.
    const trimmedLines = existingLines[existingLines.length - 1] === '' ? existingLines.slice(0, -1) : existingLines;
    const content = [...trimmedLines, ...newLines].join('\n') + '\n';

    // Atomic write: tmp → rename. Update process.env only after the file is durably written.
    const tmpPath = ROOT_ENV_PATH + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, ROOT_ENV_PATH);

    for (const [key, value] of Object.entries(updates)) {
      if (value !== '') process.env[key] = value;
    }

    const restartRequired = Object.keys(updates).some(key => {
      const def = ENV_VAR_DEFINITIONS.find(d => d.key === key);
      return def?.needsRestart ?? false;
    });

    return { restartRequired };
  }

  isKnownKey(key: string): boolean {
    return ALLOWED_KEYS.has(key);
  }
}
