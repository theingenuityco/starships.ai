#!/usr/bin/env tsx

import { seedMCPServers } from './seed-mcp-servers';
import { queryMCPServers } from './query-mcp-servers';

/**
 * Test script to verify MCP server seeding functionality
 */
async function testMCPSeeding() {
  console.log('🧪 Testing MCP Server seeding functionality...\n');

  try {
    // Step 1: Query existing servers before seeding
    console.log('📋 Step 1: Checking existing MCP servers...');
    await queryMCPServers();
    console.log('\n' + '='.repeat(50) + '\n');

    // Step 2: Run seeding
    console.log('🌱 Step 2: Running MCP server seeding...');
    await seedMCPServers();
    console.log('\n' + '='.repeat(50) + '\n');

    // Step 3: Query servers after seeding
    console.log('📋 Step 3: Verifying seeded MCP servers...');
    await queryMCPServers();

    console.log('\n✅ MCP Server seeding test completed successfully!');
  } catch (error) {
    console.error('\n❌ MCP Server seeding test failed:', error);
    process.exit(1);
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testMCPSeeding().catch(console.error);
}

export { testMCPSeeding };
