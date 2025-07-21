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
    args: [
      'run',
      '-i',
      '--rm',
      '-e',
      'GITHUB_PERSONAL_ACCESS_TOKEN',
      '-e',
      'GITHUB_TOOLSETS',
      '-e',
      'GITHUB_READ_ONLY',
      'ghcr.io/github/github-mcp-server',
    ],
    env: JSON.stringify({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'Github_API_key',
      GITHUB_TOOLSETS: '',
      GITHUB_READ_ONLY: '',
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
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'FILESYSTEM_PATH'],
    env: JSON.stringify({
      FILESYSTEM_PATH: 'FILESYSTEM_PATH',
    }),
  },
  {
    name: 'Notion',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: JSON.stringify({
      OPENAPI_MCP_HEADERS: '{"Authorization": "Notion_API_Key", "Notion-Version": "2022-06-28"}',
    }),
  },
  {
    name: 'PostgreSQL',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: JSON.stringify({
      POSTGRES_CONNECTION_STRING: 'POSTGRES_CONNECTION_STRING',
    }),
  },
  {
    name: 'Brave Search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: JSON.stringify({
      BRAVE_API_KEY: 'Brave_API_Key',
    }),
  },
  {
    name: 'Google Drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    env: JSON.stringify({
      GDRIVE_CREDENTIALS_PATH: 'Path_To_JSON',
    }),
  },
  {
    name: 'Slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: JSON.stringify({
      SLACK_BOT_TOKEN: 'Slack_API_key',
    }),
  },
  {
    name: 'Memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: JSON.stringify({}),
  },
  {
    name: 'Time',
    command: 'uvx',
    args: ['mcp-server-time', '--local-timezone=America/New_York'],
    env: JSON.stringify({}),
  },
  {
    name: 'Stripe',
    command: 'npx',
    args: ['-y', '@stripe/mcp', '--tools=all', '--api-key=Stripe_API_Key'],
    env: JSON.stringify({
      STRIPE_API_KEY: 'Stripe_API_Key',
    }),
  },
];

async function seedMCPServers() {
  console.log('🌱 Starting MCP Server Options seeding...');

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
