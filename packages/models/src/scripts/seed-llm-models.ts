

/**
 * Seed script for LLM models
 * This creates the necessary LLM model entries in the database
 */

import { createConnection, Neo4jConfig } from '../helpers/database';
import { LLMRepository } from '../repositories/LLMRepository';

const LLM_MODELS = [
  {
    id: 'gpt-4',
    name: 'gpt-4',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.045
  },
  {
    id: 'gpt-4-turbo',
    name: 'gpt-4-turbo-preview',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.02
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'gpt-3.5-turbo',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.001
  },
  {
    id: 'claude-3-opus',
    name: 'claude-3-opus-20240229',
    provider: 'anthropic',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.045
  },
  {
    id: 'claude-3-sonnet',
    name: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.009
  },
  {
    id: 'claude-3-haiku',
    name: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    temperature: 0.7,
    maxTokens: 4000,
    
    supportsStreaming: true,
    supportsTools: true,
    costPer1kTokens: 0.00175
  }
];

export async function seedLLMModels() {
  console.log('🌱 LLM models are now seeded automatically during schema initialization');
  console.log('✅ No additional seeding required - models are created in 001_initialize_schema.cypher');
  
  // List existing models for verification
  try {
    const llmRepo = new LLMRepository();
    const existingModels = await llmRepo.findAll();
    console.log(`📋 Found ${existingModels.length} LLM models in database`);
    
    if (existingModels.length > 0) {
      console.log('📋 Available LLM models:');
      existingModels.forEach(model => {
        console.log(`  - ${model.name} (${model.provider})`);
      });
    }
  } catch (error) {
    console.error('❌ Error checking LLM models:', error);
  }
}

// If running as a script
if (require.main === module) {
  async function runSeedScript() {
    // Load environment variables from project root
    const path = await import('path');
    const fs = await import('fs');
    
    // Look for .env file in project root (two levels up from this script)
    const envPath = path.resolve(__dirname, '../../../../.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach((line: string) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      });
      console.log('📋 Loaded environment variables from', envPath);
    }
    
    // Load configuration from environment
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
    console.log('🔧 Using Neo4j config:', {
      uri: config.uri,
      username: config.username,
      [DEFAULT-PASSWORD]: '***masked***',
      database: config.database
    });
    
    const connection = createConnection(config);
    
    // Connect to the database
    await connection.connect();
    console.log('📊 Connected to Neo4j database');
    
    await seedLLMModels();
    
    // List all models
    console.log('\n📋 Available LLM models:');
    const llmRepo = new LLMRepository();
    const allModels = await llmRepo.findAll();
    allModels.forEach(model => {
      console.log(`  - ${model.id}: ${model.name} (${model.provider})`);
    });
    
    await connection.disconnect();
  }
  
  runSeedScript().catch(console.error);
}