/**
 * Complete environment configuration with typed keys
 */
export interface EnvironmentConfig {
  // Server Configuration
  SERVER_PORT: number;
  CLIENT_PORT: number;
  DOCS_PORT: number;
  PROXY_PORT: number;
  NODE_ENV: string;

  // URLs
  PUBLIC_URL: string;
  CLIENT_URL: string;
  SERVER_URL: string;
  DOCS_URL: string;

  // PostgreSQL Database Configuration
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DATABASE: string;
  POSTGRES_SSL: boolean;
  // Restricted read-only role backing the per-starship agent SQL surface.
  // Optional: when the password is absent the agent SQL surface is disabled.
  POSTGRES_AGENT_USER: string;
  POSTGRES_AGENT_PASSWORD?: string;

  // LLM Provider Configuration
  OPENROUTER_API_KEY?: string;
  /**
   * Controls which avatar generation pipeline is used by default when callers do not specify a mode.
   * - '3d': current game-character style pipeline
   * - '2d': legacy anime-style pipeline
   */
  AVATAR_GENERATION_MODE?: '2d' | '3d';

  // AWS Bedrock Configuration (optional; used by autopilot execution bundle)
  AWS_BEDROCK_ACCESS_KEY_ID?: string;
  AWS_BEDROCK_SECRET_ACCESS_KEY?: string;
  AWS_BEDROCK_REGION?: string;

  // Azure AI Foundry Configuration (optional; used by autopilot execution bundle)
  AZURE_AI_FOUNDRY_API_KEY?: string;
  AZURE_AI_FOUNDRY_ENDPOINT?: string;
  AZURE_AI_FOUNDRY_API_VERSION?: string;

  // JWT Authentication Configuration
  JWT_SECRET: string;

  /**
   * Token used to authorize Next.js ISR tag/path revalidation requests.
   * Keep this distinct from any auth secrets (e.g. JWT_SECRET).
   */
  REVALIDATE_TOKEN?: string;

  // OAuth Provider Configuration
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // GitHub OAuth App (used for user login)
  GH_OAUTH_CLIENT_ID?: string;
  GH_OAUTH_CLIENT_SECRET?: string;
  // GitHub App (used for the GitHub connector: installation tokens, bot identity)
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string; // base64-encoded PEM
  GITHUB_APP_SLUG?: string;

  // Environment Variables Encryption Key
  ENCRYPTION_KEY?: string;

  // Google Analytics
  GA_MEASUREMENT_ID?: string;

  // Remote runner (optional)
  RUNNER_URL?: string;
  RUNNER_PORT?: number;
  RUNNER_AUTH_TOKEN?: string;

  // Bundle service (optional)
  BUNDLE_SERVICE_URL?: string;

  // Email Service Configuration (Amazon SES)
  /**
   * Global gate for outbound email delivery.
   * - true: allow email sends (if SES config is present)
   * - false: skip all email sends (no-op, logged by EmailService)
   *
   * Defaults to false when not set (safe-by-default).
   */
  ENABLE_EMAILS: boolean;
  /**
   * When true, repo-backed agent turns run via the code-native CLI agent
   * (@starships/autopilot-cli) instead of the DAG blueprint. Experimental;
   * defaults to false. See packages/server/src/services/CliAgentTurn.ts.
   */
  USE_CLI_AGENT_PATH: boolean;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  AWS_SES_REGION?: string;

  // Connector platform secrets (OAuth app creds, bot tokens, etc.) are stored in DB
  // via platform_secrets and managed by instance admins.

  // AWS S3 Configuration (File Attachments)
  AWS_S3_BUCKET?: string;
  AWS_S3_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;

  // Redis / Queueing Configuration
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_DB?: number;
  REDIS_PASSWORD?: string;
}
