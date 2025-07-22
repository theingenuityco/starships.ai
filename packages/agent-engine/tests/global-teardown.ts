/**
 * Global Test Teardown for Agent Engine
 * Cleans up test environment and resources
 */

export default async () => {
  console.log('🧹 [GLOBAL-TEARDOWN] Cleaning up Agent Engine test environment...');

  const fs = await import('fs');
  const path = await import('path');

  try {
    // Clean up test fixtures directory
    const testDataDir = path.join(__dirname, 'fixtures');
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
      console.log('📁 [GLOBAL-TEARDOWN] Test fixtures cleaned up');
    }

    // Clear test-specific environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FAISS_INDEX_PATH;
    delete process.env.TEST_TIMEOUT_MS;
    delete process.env.AI_OPERATION_TIMEOUT;

    console.log('🔄 [GLOBAL-TEARDOWN] Environment variables cleared');
    console.log('✅ [GLOBAL-TEARDOWN] Test environment cleanup completed');

  } catch (error) {
    console.error('❌ [GLOBAL-TEARDOWN] Error during cleanup:', error);
    // Don't throw error to avoid failing the entire test suite
  }
};