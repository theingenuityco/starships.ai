export interface EnvironmentConfig {
  // Server Configuration
  PORT: number;
  NODE_ENV: string;

  // Neo4j Configuration
  NEO4J_URI: string;
  NEO4J_USERNAME: string;
  NEO4J_PASSWORD: string;
  NEO4J_DATABASE: string;

  // LLM Provider Configuration
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  
  // Default Model Configuration
  DEFAULT_CHAT_MODEL: string;
  DEFAULT_EMBEDDING_MODEL: string;
  DEFAULT_PROVIDER: 'openai' | 'anthropic';
  DEFAULT_MODEL_ID: string;
  DEFAULT_TEMPERATURE: number;
  DEFAULT_MAX_TOKENS: number;

  // Vector Store Configuration
  FAISS_INDEX_PATH: string;
}

function validateEnvironment(): EnvironmentConfig {
  const config: EnvironmentConfig = {
    // Server Configuration
    PORT: parseInt(process.env.PORT || '4000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Neo4j Configuration
    NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
    NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'password',
    NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',

    // LLM Provider Configuration
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    
    // Default Model Configuration
    DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4',
    DEFAULT_EMBEDDING_MODEL: process.env.DEFAULT_EMBEDDING_MODEL || 'text-embedding-3-small',
    DEFAULT_PROVIDER: (process.env.DEFAULT_PROVIDER as 'openai' | 'anthropic') || 'openai',
    DEFAULT_MODEL_ID: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
    DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
    DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),

    // Vector Store Configuration
    FAISS_INDEX_PATH: process.env.FAISS_INDEX_PATH || './data/faiss_index',
  };

  // Validate required configurations
  if (config.DEFAULT_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
    console.warn('Warning: OPENAI_API_KEY is not set but OpenAI is the default provider');
  }
  
  if (config.DEFAULT_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) {
    console.warn('Warning: ANTHROPIC_API_KEY is not set but Anthropic is the default provider');
  }

  return config;
}

export const env = validateEnvironment(); 