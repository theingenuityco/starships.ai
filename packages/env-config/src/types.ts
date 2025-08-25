/**
 * Server-side environment variables
 */
export interface ServerEnvironmentConfig {
  // Server Configuration
  PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;

  // Deployment
  REDEPLOY_SECRET: string;

  // External Services
  DISCORD_BOT_TOKEN?: string;
  OPEN_WEBUI_BASE_URL?: string;

  // Neo4j Database Configuration
  NEO4J_URI: string;
  NEO4J_USERNAME: string;
  NEO4J_PASSWORD: string;
  NEO4J_DATABASE: string;

  // LLM Provider Configuration
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  
  // Default Model Configuration
  DEFAULT_LLM_PROVIDER: 'openai' | 'anthropic' | '';
  DEFAULT_CHAT_MODEL: string;
  
  DEFAULT_MODEL_ID: string;
  DEFAULT_TEMPERATURE: number;
  DEFAULT_MAX_TOKENS: number;

  

  // Kinde Authentication Configuration (Server-side)
  KINDE_CLIENT_ID: string;
  KINDE_CLIENT_SECRET: string;
  KINDE_ISSUER_URL: string;
  KINDE_SITE_URL: string;
  KINDE_POST_LOGIN_REDIRECT_URL: string;
  KINDE_POST_LOGOUT_REDIRECT_URL: string;
  KINDE_DEBUG_MODE?: boolean;
  
  // Stripe Configuration
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  
  // Stripe Price IDs (populated by setup script)
  STRIPE_PRICE_CRUISER_MONTHLY?: string;
  STRIPE_PRICE_CRUISER_YEARLY?: string;
  STRIPE_PRICE_DRAUGHT_MONTHLY?: string;
  STRIPE_PRICE_DRAUGHT_YEARLY?: string;
}

/**
 * Client-side environment variables (Next.js)
 * Note: These must be prefixed with NEXT_PUBLIC_ to be available in the browser
 */
export interface ClientEnvironmentConfig {
  // API Configuration
  NEXT_PUBLIC_API_URL?: string;
}

/**
 * Combined environment configuration
 */
export interface EnvironmentConfig extends ServerEnvironmentConfig, ClientEnvironmentConfig {}

/**
 * Environment validation error
 */
export class EnvironmentValidationError extends Error {
  constructor(message: string, public missingVariables: string[]) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
} 