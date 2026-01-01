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

  // LLM Provider Configuration
  OPENROUTER_API_KEY?: string;

  // JWT Authentication Configuration
  JWT_SECRET: string;

  // OAuth Provider Configuration
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // GitHub OAuth App (used for user login)
  GH_OAUTH_CLIENT_ID?: string;
  GH_OAUTH_CLIENT_SECRET?: string;

  // Environment Variables Encryption Key
  ENCRYPTION_KEY?: string;

  // Stripe Configuration
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_FRIGATE_PRICE_ID?: string;

  // Google Analytics
  GA_MEASUREMENT_ID?: string;

  // Remote runner (optional)
  RUNNER_URL?: string;
  RUNNER_PORT?: number;
  RUNNER_AUTH_TOKEN?: string;

  // Email Service Configuration (Amazon SES)
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
