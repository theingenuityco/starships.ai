// Migration: 007_seed_llm_models.cypher
// Description: Seed LLM models for agent configuration
// Date: 2025-07-31
// Author: System
// Dependencies: 006_expedition_seed_data

// ============================================================================
// LLM MODELS SEED DATA
// ============================================================================

// Create OpenAI models
MERGE (gpt4:LLM {id: 'gpt-4'})
ON CREATE SET 
  gpt4.name = 'gpt-4',
  gpt4.provider = 'openai',
  gpt4.contextWindow = 8192,
  gpt4.maxOutputTokens = 4096,
  gpt4.temperature = 0.7,
  gpt4.maxTokens = 4000,
  gpt4.capabilities = ['text-generation', 'chat', 'function-calling'],
  gpt4.costPer1kInput = 0.03,
  gpt4.costPer1kOutput = 0.06,
  gpt4.description = 'OpenAI GPT-4 - Advanced reasoning and analysis',
  gpt4.isActive = true,
  gpt4.createdAt = datetime().epochMillis;

MERGE (gpt4turbo:LLM {id: 'gpt-4-turbo'})
ON CREATE SET 
  gpt4turbo.name = 'gpt-4-turbo-preview',
  gpt4turbo.provider = 'openai',
  gpt4turbo.contextWindow = 128000,
  gpt4turbo.maxOutputTokens = 4096,
  gpt4turbo.temperature = 0.7,
  gpt4turbo.maxTokens = 4000,
  gpt4turbo.capabilities = ['text-generation', 'chat', 'function-calling', 'vision'],
  gpt4turbo.costPer1kInput = 0.01,
  gpt4turbo.costPer1kOutput = 0.03,
  gpt4turbo.description = 'OpenAI GPT-4 Turbo - Faster and more cost-effective',
  gpt4turbo.isActive = true,
  gpt4turbo.createdAt = datetime().epochMillis;

MERGE (gpt35:LLM {id: 'gpt-3.5-turbo'})
ON CREATE SET 
  gpt35.name = 'gpt-3.5-turbo',
  gpt35.provider = 'openai',
  gpt35.contextWindow = 16385,
  gpt35.maxOutputTokens = 4096,
  gpt35.temperature = 0.7,
  gpt35.maxTokens = 4000,
  gpt35.capabilities = ['text-generation', 'chat', 'function-calling'],
  gpt35.costPer1kInput = 0.0005,
  gpt35.costPer1kOutput = 0.0015,
  gpt35.description = 'OpenAI GPT-3.5 Turbo - Fast and efficient',
  gpt35.isActive = true,
  gpt35.createdAt = datetime().epochMillis;

// Create Anthropic models
MERGE (claude3opus:LLM {id: 'claude-3-opus'})
ON CREATE SET 
  claude3opus.name = 'claude-3-opus-20240229',
  claude3opus.provider = 'anthropic',
  claude3opus.contextWindow = 200000,
  claude3opus.maxOutputTokens = 4096,
  claude3opus.temperature = 0.7,
  claude3opus.maxTokens = 4000,
  claude3opus.capabilities = ['text-generation', 'chat', 'vision'],
  claude3opus.costPer1kInput = 0.015,
  claude3opus.costPer1kOutput = 0.075,
  claude3opus.description = 'Claude 3 Opus - Most capable Claude model',
  claude3opus.isActive = true,
  claude3opus.createdAt = datetime().epochMillis;

MERGE (claude3sonnet:LLM {id: 'claude-3-sonnet'})
ON CREATE SET 
  claude3sonnet.name = 'claude-3-sonnet-20240229',
  claude3sonnet.provider = 'anthropic',
  claude3sonnet.contextWindow = 200000,
  claude3sonnet.maxOutputTokens = 4096,
  claude3sonnet.temperature = 0.7,
  claude3sonnet.maxTokens = 4000,
  claude3sonnet.capabilities = ['text-generation', 'chat', 'vision'],
  claude3sonnet.costPer1kInput = 0.003,
  claude3sonnet.costPer1kOutput = 0.015,
  claude3sonnet.description = 'Claude 3 Sonnet - Balanced performance',
  claude3sonnet.isActive = true,
  claude3sonnet.createdAt = datetime().epochMillis;

MERGE (claude3haiku:LLM {id: 'claude-3-haiku'})
ON CREATE SET 
  claude3haiku.name = 'claude-3-haiku-20240307',
  claude3haiku.provider = 'anthropic',
  claude3haiku.contextWindow = 200000,
  claude3haiku.maxOutputTokens = 4096,
  claude3haiku.temperature = 0.7,
  claude3haiku.maxTokens = 4000,
  claude3haiku.capabilities = ['text-generation', 'chat', 'vision'],
  claude3haiku.costPer1kInput = 0.00025,
  claude3haiku.costPer1kOutput = 0.00125,
  claude3haiku.description = 'Claude 3 Haiku - Fast and affordable',
  claude3haiku.isActive = true,
  claude3haiku.createdAt = datetime().epochMillis;

// Log migration completion
CREATE (m:Migration {
  id: '007_seed_llm_models',
  name: 'LLM Models Seed Data',
  description: 'Seed data for LLM models used by agents',
  version: '1.0.0',
  dependencies: ['006_expedition_seed_data'],
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  llmModelsCount: 6,
  providersCount: 2
})
RETURN m.id as migrationId, m.appliedAt as appliedAt, m.llmModelsCount as llmModels, m.providersCount as providers;