

/**
 * Seed script for LLM models
 * This creates the necessary LLM model entries in the database
 */

import { createConnection, Neo4jConfig } from '../connection';
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
  console.log('🌱 Starting LLM models seeding...');
  
  const llmRepo = new LLMRepository();

  try {
    // Check if any LLM models already exist
    const existingModels = await llmRepo.findAll();
    
    if (existingModels.length > 0) {
      console.log(`📋 Found ${existingModels.length} existing LLM models`);
      console.log('🔄 Checking for missing models to add...');
      
      // Only add models that don't already exist (check by name, not ID)
      const existingNames = new Set(existingModels.map(m => m.name));
      const modelsToAdd = LLM_MODELS.filter(m => !existingNames.has(m.name));
      
      if (modelsToAdd.length === 0) {
        console.log('✅ All default LLM models already exist');
        return;
      }
      
      console.log(`📝 Adding ${modelsToAdd.length} new LLM models...`);
      
      for (const model of modelsToAdd) {
        try {
          await llmRepo.create({
            ...model,
            createdAt: new Date().toISOString()
          } as any);
          console.log(`  ✅ Added: ${model.id} (${model.name})`);
        } catch (error) {
          console.error(`  ❌ Failed to add ${model.id}:`, error);
        }
      }
    } else {
      // No existing models, add all defaults
      console.log('📝 No existing LLM models found, adding all defaults...');
      
      for (const model of LLM_MODELS) {
        try {
          await llmRepo.create({
            ...model,
            createdAt: new Date().toISOString()
          } as any);
          console.log(`  ✅ Added: ${model.id} (${model.name})`);
        } catch (error) {
          console.error(`  ❌ Failed to add ${model.id}:`, error);
        }
      }
    }

    console.log('✅ LLM model seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding LLM models:', error);
    // Don't throw - allow server to continue even if seeding fails
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
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'mcppassword',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
    console.log('🔧 Using Neo4j config:', {
      uri: config.uri,
      username: config.username,
      password: '***masked***',
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