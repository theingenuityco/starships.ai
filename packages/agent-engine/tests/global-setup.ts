/**
 * Global Test Setup for Agent Engine
 * Configures mock environment for AI/ML testing
 */

export default async () => {
  console.log('🔧 [GLOBAL-SETUP] Initializing Agent Engine test environment...');

  // Mock external AI services
  process.env.OPENAI_API_KEY = 'test-openai-key-mock';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-mock';
  process.env.DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
  process.env.DEFAULT_CHAT_MODEL = 'gpt-4';
  process.env.DEFAULT_PROVIDER = 'openai';
  process.env.DEFAULT_TEMPERATURE = '0.7';
  process.env.DEFAULT_MAX_TOKENS = '4096';

  // Mock FAISS and file system paths
  process.env.FAISS_INDEX_PATH = './tests/fixtures/test_faiss_index';
  
  // Create test data directories
  const fs = await import('fs');
  const path = await import('path');
  
  const testDataDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(testDataDir, { recursive: true });
  
  // Create mock FAISS index directory
  const faissDir = path.join(__dirname, 'fixtures', 'test_faiss_index');
  fs.mkdirSync(faissDir, { recursive: true });
  
  // Mock sessions directory
  const sessionsDir = path.join(testDataDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  // Set test-specific timeouts for AI operations
  process.env.TEST_TIMEOUT_MS = '30000';
  process.env.AI_OPERATION_TIMEOUT = '10000';

  console.log('✅ [GLOBAL-SETUP] Test environment initialized');
  console.log(`📁 Test data directory: ${testDataDir}`);
  console.log(`🤖 Mock AI services configured`);
  console.log(`⚡ Test timeouts configured`);
};