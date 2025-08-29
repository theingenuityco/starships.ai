

/**
 * Seed script for LLM models
 * This creates the necessary LLM model entries in the database
 */

import { createConnection, Neo4jConfig } from '../helpers/database';
import { LLMRepository } from '../repositories/LLMRepository';


export async function seedLLMModels() {
  console.log('🌱 Seeding LLM models...');
  
  try {
    const llmRepo = new LLMRepository();
    const existingModels = await llmRepo.findAll();
    console.log(`📋 Found ${existingModels.length} existing LLM models in database`);
    
    if (existingModels.length > 0) {
      console.log('✅ LLM models already seeded. Available models:');
      existingModels.forEach(model => {
        console.log(`  - ${model.name} (${model.provider})`);
      });
      return;
    }
    
    console.log('📦 Seeding LLM models...');
    
    const modelsToSeed = [
      // OpenAI Models
      {
        name: 'gpt-4o',
        provider: 'openai' as const,
        maxTokens: 128000,
        temperature: 0.7,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: 0.015,
        createdAt: new Date().toISOString()
      },
      {
        name: 'gpt-4o-mini',
        provider: 'openai' as const,
        maxTokens: 128000,
        temperature: 0.7,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: 0.0015,
        createdAt: new Date().toISOString()
      },
      {
        name: 'gpt-3.5-turbo',
        provider: 'openai' as const,
        maxTokens: 16385,
        temperature: 0.7,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: 0.002,
        createdAt: new Date().toISOString()
      },
      // Anthropic Models
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic' as const,
        maxTokens: 8192,
        temperature: 0.7,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: 0.018,
        createdAt: new Date().toISOString()
      },
      {
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic' as const,
        maxTokens: 4096,
        temperature: 0.7,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: 0.00125,
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const modelData of modelsToSeed) {
      try {
        const created = await llmRepo.create(modelData);
        console.log(`✅ Created LLM model: ${created.name} (${created.provider})`);
      } catch (error) {
        console.error(`❌ Failed to create model ${modelData.name}:`, error);
      }
    }
    
    const finalModels = await llmRepo.findAll();
    console.log(`🎉 Seeding completed! Total LLM models: ${finalModels.length}`);
    
  } catch (error) {
    console.error('❌ Error during LLM model seeding:', error);
    throw error;
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
      password: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
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