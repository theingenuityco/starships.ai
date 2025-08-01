#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { MCPServerOptionRepository } from '../repositories/MCPServerOptionRepository';
import { MCPServerConnectorRepository } from '../repositories/MCPServerConnectorRepository';

/**
 * Script to clean up removed MCP connectors from the database
 */

const REMOVED_SLUGS = [
  'brave',
  'filesystem',
  'gdrive',
  'github',
  'memory',
  'notion',
  'postgresql',
  'puppeteer',
  'slack',
  'stripe',
];

const REMOVED_NAMES = [
  'brave search',
  'filesystem',
  'github',
  'google drive',
  'memory',
  'notion',
  'postgresql',
  'puppeteer',
  'slack',
  'stripe',
];

async function cleanupRemovedConnectors() {
  console.log('🧹 Starting cleanup of removed MCP connectors...');

  try {
    const serverOptionRepo = new MCPServerOptionRepository();
    const connectorRepo = new MCPServerConnectorRepository();

    // First, find and remove any MCP server options for removed connectors
    console.log('\n📋 Checking for removed MCP server options...');
    const allOptions = await serverOptionRepo.findAll();

    for (const option of allOptions) {
      // Check by slug, name, or if command is undefined
      const shouldRemove =
        REMOVED_SLUGS.includes(option.slug) ||
        REMOVED_NAMES.some((name) => option.name.toLowerCase().includes(name)) ||
        !option.command;

      if (shouldRemove) {
        console.log(
          `  🗑️  Removing MCP server option: ${option.name} (${option.slug || 'no-slug'})`
        );

        // First, find and remove any connector instances
        const connectorInstances = await connectorRepo.findByTemplate(option.id);
        if (connectorInstances.length > 0) {
          console.log(`    Found ${connectorInstances.length} connector instances to remove`);
          for (const connector of connectorInstances) {
            await connectorRepo.delete(connector.id);
            console.log(`    ✅ Removed connector instance: ${connector.id}`);
          }
        }

        // Then remove the server option
        await serverOptionRepo.delete(option.id);
        console.log(`  ✅ Removed MCP server option: ${option.name}`);
      }
    }

    // Verify final state
    const remainingOptions = await serverOptionRepo.findAll();
    console.log(`\n📊 Cleanup complete! Remaining MCP server options: ${remainingOptions.length}`);

    console.log('\n📋 Remaining MCP servers:');
    remainingOptions.forEach((option, index) => {
      console.log(`${index + 1}. ${option.name} (${option.slug})`);
    });
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  (async () => {
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
      await cleanupRemovedConnectors();
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    } finally {
      await connection.disconnect();
      console.log('🔌 Database connection closed');
    }
  })().catch(console.error);
}

export { cleanupRemovedConnectors };
