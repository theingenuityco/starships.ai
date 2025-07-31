#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { MCPServerOptionRepository } from '../repositories/MCPServerOptionRepository';
import { MCPServerOption } from '../types';

/**
 * Default MCP Server Options to seed in the database
 * Based on popular MCP servers from the community
 */
const DEFAULT_MCP_SERVERS: Omit<MCPServerOption, 'id'>[] = [
  {
    name: 'Time',
    slug: 'time',
    command: 'uvx',
    args: ['mcp-server-time', '--local-timezone=America/New_York'],
    env: JSON.stringify({}),
  },
  {
    name: 'Sequential Thinking',
    slug: 'sequentialthinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    env: JSON.stringify({}),
  },
  {
    name: 'Firecrawl',
    slug: 'firecrawl',
    command: 'node',
    args: ['firecrawl-mcp'],
    env: JSON.stringify({
      FIRECRAWL_API_KEY: '${FIRECRAWL_API_KEY}',
    }),
  },
];

async function seedMCPServers() {
  console.log('🌱 Starting MCP Server Options seeding...');

  try {
    const mcpServerRepo = new MCPServerOptionRepository();

    // Check if any MCP servers already exist
    const existingServers = await mcpServerRepo.findAll();

    if (existingServers.length > 0) {
      console.log(`📋 Found ${existingServers.length} existing MCP server options`);
      console.log('🔄 Checking for missing servers to add...');

      // Only add servers that don't already exist (by name)
      const existingNames = new Set(existingServers.map((s) => s.name));
      const serversToAdd = DEFAULT_MCP_SERVERS.filter((s) => !existingNames.has(s.name));

      if (serversToAdd.length === 0) {
        console.log('✅ All default MCP servers already exist');
        return;
      }

      console.log(`➕ Adding ${serversToAdd.length} missing MCP servers...`);

      for (const serverData of serversToAdd) {
        try {
          const created = await mcpServerRepo.create(serverData);
          console.log(`  ✅ Created: ${created.name} (${created.id})`);
        } catch (error) {
          console.error(`  ❌ Failed to create ${serverData.name}:`, error);
        }
      }
    } else {
      console.log('📋 No existing MCP server options found, creating all defaults...');

      // Create all default servers
      for (const serverData of DEFAULT_MCP_SERVERS) {
        try {
          const created = await mcpServerRepo.create(serverData);
          console.log(`  ✅ Created: ${created.name} (${created.id})`);
        } catch (error) {
          console.error(`  ❌ Failed to create ${serverData.name}:`, error);
        }
      }
    }

    // Verify final count
    const finalServers = await mcpServerRepo.findAll();
    console.log(`\n🎯 Seeding complete! Total MCP server options: ${finalServers.length}`);

    // Display summary
    console.log('\n📊 Available MCP Servers:');
    console.log('========================');
    finalServers.forEach((server, index) => {
      console.log(`${index + 1}. ${server.name} (${server.command})`);
    });
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error; // Re-throw to allow caller to handle
  }
}

// Run seeding if this script is executed directly
if (require.main === module) {
  (async () => {
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    const connection = createConnection(config);

    try {
      await connection.connect();
      console.log('✅ Connected to Neo4j');
      await seedMCPServers();
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    } finally {
      await connection.disconnect();
      console.log('🔌 Database connection closed');
    }
  })().catch(console.error);
}

export { seedMCPServers, DEFAULT_MCP_SERVERS };
