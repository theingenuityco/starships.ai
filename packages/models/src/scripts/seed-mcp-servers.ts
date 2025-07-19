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
    name: 'GitHub',
    command: 'docker',
    args: ['run', '-i', '--rm', 'mcp/github'],
    env: JSON.stringify({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'Your GitHub Personal Access Token',
    }),
  },
  {
    name: 'Puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    env: JSON.stringify({}),
  },
  {
    name: 'Filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
    env: JSON.stringify({}),
  },
  {
    name: 'SQLite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
    env: JSON.stringify({}),
  },
  {
    name: 'PostgreSQL',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: JSON.stringify({
      POSTGRES_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/database',
    }),
  },
  {
    name: 'Brave Search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: JSON.stringify({
      BRAVE_API_KEY: 'Your Brave Search API Key',
    }),
  },
  {
    name: 'Google Drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    env: JSON.stringify({
      GOOGLE_CLIENT_ID: 'Your Google Client ID',
      GOOGLE_CLIENT_SECRET: 'Your Google Client Secret',
    }),
  },
  {
    name: 'Slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: JSON.stringify({
      SLACK_BOT_TOKEN: 'Your Slack Bot Token',
    }),
  },
  {
    name: 'Memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: JSON.stringify({}),
  },
  {
    name: 'Everything',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    env: JSON.stringify({}),
  },
  {
    name: 'Fetch',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    env: JSON.stringify({}),
  },
  {
    name: 'Time',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-time'],
    env: JSON.stringify({}),
  },
];

async function seedMCPServers() {
  console.log('🌱 Starting MCP Server Options seeding...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

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
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run seeding if this script is executed directly
if (require.main === module) {
  seedMCPServers().catch(console.error);
}

export { seedMCPServers, DEFAULT_MCP_SERVERS };
