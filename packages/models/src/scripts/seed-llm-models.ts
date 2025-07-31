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

async function seedLLMModels() {
  // Load configuration from environment
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };
  
  const connection = createConnection(config);
  
  // Connect to the database
  await connection.connect();
  console.log('📊 Connected to Neo4j database');
  
  const llmRepo = new LLMRepository();

  console.log('🌱 Seeding LLM models...\n');

  try {
    for (const model of LLM_MODELS) {
      try {
        // Check if model already exists
        const existing = await llmRepo.findById(model.id);
        if (existing) {
          console.log(`✅ Model already exists: ${model.id} (${model.name})`);
          continue;
        }

        // Create the model
        await llmRepo.create(model as any);
        console.log(`✅ Created model: ${model.id} (${model.name})`);
      } catch (error) {
        console.error(`❌ Failed to create model ${model.id}:`, error);
      }
    }

    console.log('\n✅ LLM model seeding completed!');
    
    // List all models
    console.log('\n📋 Available LLM models:');
    const allModels = await llmRepo.findAll();
    allModels.forEach(model => {
      console.log(`  - ${model.id}: ${model.name} (${model.provider})`);
    });

  } catch (error) {
    console.error('❌ Error seeding LLM models:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
  }
}

// Run the seed script
seedLLMModels().catch(console.error);