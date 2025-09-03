/**
 * Complete environment configuration with typed keys
 */
export interface EnvironmentConfig {
  // Server Configuration
  SERVER_PORT: number;
  CLIENT_PORT: number;
  NODE_ENV: string;
  LOG_LEVEL: string;
  
  // URLs
  PUBLIC_URL: string;
  CLIENT_URL: string;
  SERVER_URL: string;

  // Deployment
  REDEPLOY_SECRET: string;

  // External Services
  DISCORD_BOT_TOKEN?: string;
  OPEN_WEBUI_BASE_URL?: string;
  ENABLE_AUTH_TESTING_BACKDOOR: boolean;

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

  // JWT Authentication Configuration
  JWT_SECRET: string;
  
  // Stripe Configuration
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  
  // Stripe Price IDs
  STRIPE_PRICE_CRUISER_MONTHLY?: string;
  STRIPE_PRICE_CRUISER_YEARLY?: string;
  STRIPE_PRICE_DRAUGHT_MONTHLY?: string;
  STRIPE_PRICE_DRAUGHT_YEARLY?: string;

  // Google Analytics
  NEXT_PUBLIC_GA_MEASUREMENT_ID?: string;
}