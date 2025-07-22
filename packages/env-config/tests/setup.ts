/**
 * Jest setup utilities for env-config package tests
 * Provides helper functions for test environment management
 */

import { EnvironmentValidationError } from '../src/types';

// Utility function to mock environment variables
export function mockEnvironmentVariables(envVars: Record<string, string | undefined>) {
  Object.keys(envVars).forEach(key => {
    if (envVars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envVars[key];
    }
  });
}

// Utility function to clear all environment variables except essential ones
export function clearEnvironmentVariables() {
  const nodeEnv = process.env.NODE_ENV;
  const jestWorker = process.env.JEST_WORKER_ID;
  
  Object.keys(process.env).forEach(key => {
    if (!key.startsWith('JEST_') && key !== 'NODE_ENV' && key !== 'npm_lifecycle_event') {
      delete process.env[key];
    }
  });
  
  // Restore essential variables
  if (nodeEnv) {
    process.env.NODE_ENV = nodeEnv;
  }
  if (jestWorker) {
    process.env.JEST_WORKER_ID = jestWorker;
  }
}

// Utility function to mock browser environment
export function mockBrowserEnvironment() {
  // Mock window object to simulate browser environment
  (global as any).window = {};
  
  return () => {
    // Cleanup function to restore Node.js environment
    delete (global as any).window;
  };
}

// Utility function to create complete valid server environment
export function createValidServerEnvironment() {
  return {
    PORT: '3000',
    NODE_ENV: 'development',
    LOG_LEVEL: 'info',
    REDEPLOY_SECRET: 'test-secret',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USERNAME: 'neo4j',
    NEO4J_PASSWORD: 'password', 
    NEO4J_DATABASE: 'neo4j',
    DEFAULT_LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-openai-key',
    DEFAULT_CHAT_MODEL: 'gpt-4',
    DEFAULT_EMBEDDING_MODEL: 'text-embedding-3-small',
    DEFAULT_MODEL_ID: 'default-openai-gpt4',
    DEFAULT_TEMPERATURE: '0.7',
    DEFAULT_MAX_TOKENS: '4096',
    FAISS_INDEX_PATH: './data/faiss_index',
    KINDE_CLIENT_ID: 'test-client-id',
    KINDE_CLIENT_SECRET: 'test-client-secret',
    KINDE_ISSUER_URL: 'https://test.kinde.com',
    KINDE_SITE_URL: 'http://localhost:3000',
    KINDE_POST_LOGIN_REDIRECT_URL: 'http://localhost:3000/callback',
    KINDE_POST_LOGOUT_REDIRECT_URL: 'http://localhost:3000/logout',
    KINDE_DEBUG_MODE: 'false'
  };
}

// Utility function to create minimal required environment for production
export function createProductionEnvironment() {
  return {
    ...createValidServerEnvironment(),
    NODE_ENV: 'production',
    KINDE_CLIENT_ID: 'prod-client-id',
    KINDE_CLIENT_SECRET: 'prod-client-secret',
    KINDE_ISSUER_URL: 'https://prod.kinde.com'
  };
}

// Utility function to create environment with missing required variables
export function createInvalidEnvironment() {
  return {
    PORT: '3000',
    NODE_ENV: 'development',
    // Missing most required variables to trigger validation errors
  };
}

// Utility function to create anthropic environment
export function createAnthropicEnvironment() {
  return {
    ...createValidServerEnvironment(),
    DEFAULT_LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    // Remove OpenAI key
    OPENAI_API_KEY: undefined
  };
}

// Helper function to validate EnvironmentValidationError structure
export function isEnvironmentValidationError(error: any, expectedMissingVars?: string[]): boolean {
  if (!(error instanceof EnvironmentValidationError)) return false;
  if (error.name !== 'EnvironmentValidationError') return false;
  if (!Array.isArray(error.missingVariables)) return false;
  
  if (expectedMissingVars) {
    return expectedMissingVars.every(variable => error.missingVariables.includes(variable));
  }
  
  return true;
}