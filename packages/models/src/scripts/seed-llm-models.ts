#!/usr/bin/env tsx

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
    contextWindow: 8192,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'function-calling'],
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    description: 'OpenAI GPT-4 - Advanced reasoning and analysis',
    isActive: true
  },
  {
    id: 'gpt-4-turbo',
    name: 'gpt-4-turbo-preview',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'function-calling', 'vision'],
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    description: 'OpenAI GPT-4 Turbo - Faster and more cost-effective',
    isActive: true
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'gpt-3.5-turbo',
    provider: 'openai',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'function-calling'],
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0015,
    description: 'OpenAI GPT-3.5 Turbo - Fast and efficient',
    isActive: true
  },
  {
    id: 'claude-3-opus',
    name: 'claude-3-opus-20240229',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'vision'],
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    description: 'Claude 3 Opus - Most capable Claude model',
    isActive: true
  },
  {
    id: 'claude-3-sonnet',
    name: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'vision'],
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    description: 'Claude 3 Sonnet - Balanced performance',
    isActive: true
  },
  {
    id: 'claude-3-haiku',
    name: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: ['text-generation', 'chat', 'vision'],
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    description: 'Claude 3 Haiku - Fast and affordable',
    isActive: true
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
      
      // Only add models that don't already exist
      const existingIds = new Set(existingModels.map(m => m.id));
      const modelsToAdd = LLM_MODELS.filter(m => !existingIds.has(m.id));
      
      if (modelsToAdd.length === 0) {
        console.log('✅ All default LLM models already exist');
        return;
      }
      
      console.log(`📝 Adding ${modelsToAdd.length} new LLM models...`);
      
      for (const model of modelsToAdd) {
        try {
          await llmRepo.create(model as any);
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
          await llmRepo.create(model as any);
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
    // Load configuration from environment
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
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