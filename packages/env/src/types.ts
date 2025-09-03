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