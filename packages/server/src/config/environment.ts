export interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: string;

  NEO4J_URI: string;
  NEO4J_USERNAME: string;
  NEO4J_PASSWORD: string;
  NEO4J_DATABASE: string;

  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  
  DEFAULT_CHAT_MODEL: string;
  DEFAULT_EMBEDDING_MODEL: string;
  DEFAULT_PROVIDER: 'openai' | 'anthropic';
  DEFAULT_MODEL_ID: string;
  DEFAULT_TEMPERATURE: number;
  DEFAULT_MAX_TOKENS: number;

  FAISS_INDEX_PATH: string;
}

/**
 * Validated environment configuration
 */
export const env: EnvironmentConfig = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
  NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'password',
  NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4',
  DEFAULT_EMBEDDING_MODEL: process.env.DEFAULT_EMBEDDING_MODEL || 'text-embedding-3-small',
  DEFAULT_PROVIDER: (process.env.DEFAULT_PROVIDER as 'openai' | 'anthropic') || 'openai',
  DEFAULT_MODEL_ID: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
  DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
  DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),
  FAISS_INDEX_PATH: process.env.FAISS_INDEX_PATH || './data/faiss_index',
};

if (env.DEFAULT_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required when DEFAULT_PROVIDER is openai');
}

if (env.DEFAULT_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required when DEFAULT_PROVIDER is anthropic');
} 