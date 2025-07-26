#!/usr/bin/env node
/**
 * Migration script for existing Brave connectors to HTTP bridge
 * 
 * This script finds all existing Brave connectors and migrates them from stdio to HTTP bridge
 */

import { connectorMigrationService } from '../services/mcp/ConnectorMigrationService';
import { MCPServerConnectorRepository, createConnection } from '@starships/models';

async function main() {
  console.log('🚀 Starting Brave connector migration to HTTP bridge...\n');

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  try {
    // Initialize database connection
    console.log('🔌 Connecting to database...');
    const dbConnection = createConnection({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    });
    await dbConnection.connect();
    // Find the Brave template ID first
    const mcpConnectorRepo = new MCPServerConnectorRepository();
    
    // We need to find Brave connectors - let's look for template slug 'brave'
    console.log('📋 Finding existing Brave connectors...');
    
    // Since findByTemplate expects templateId but we have slug, we need to query differently
    // Let's check all connectors and filter for Brave
    const allConnectors = await mcpConnectorRepo.findAll();
    const braveConnectors = allConnectors.filter(connector => {
      // Check if this is a Brave connector based on service name or other identifiers
      return connector.dockerServiceName?.includes('brave') || 
             connector.id.includes('brave') ||
             (connector as any).templateSlug === 'brave';
    });

    console.log(`📊 Found ${braveConnectors.length} Brave connectors to migrate`);
    
    if (braveConnectors.length === 0) {
      console.log('✨ No Brave connectors found that need migration');
      return;
    }

    // Filter out connectors that are already using HTTP bridge
    const legacyBraveConnectors = braveConnectors.filter(connector => 
      !connector.httpBridgeEnabled
    );

    if (legacyBraveConnectors.length === 0) {
      console.log('✨ All Brave connectors are already using HTTP bridge');
      return;
    }

    console.log(`🔄 Migrating ${legacyBraveConnectors.length} legacy Brave connectors...\n`);

    // Migrate each connector
    for (const connector of legacyBraveConnectors) {
      console.log(`📦 Migrating connector ${connector.id} (starship: ${connector.starshipId})...`);
      
      try {
        const result = await connectorMigrationService.migrateToHttpBridge({
          connectorId: connector.id,
          backupBeforeMigration: true,
          rollbackOnFailure: true,
          testBeforeSwitch: true,
          gracefulShutdown: true
        });

        if (result.success) {
          successCount++;
          console.log(`✅ Successfully migrated connector ${connector.id} in ${result.migrationTime}ms`);
          if (result.warnings && result.warnings.length > 0) {
            console.log(`⚠️  Warnings: ${result.warnings.join(', ')}`);
          }
        } else {
          failureCount++;
          console.log(`❌ Failed to migrate connector ${connector.id}: ${result.errorMessage}`);
          if (result.rollbackRequired) {
            console.log(`🔄 Manual rollback required for connector ${connector.id}`);
          }
        }
      } catch (error) {
        failureCount++;
        console.error(`💥 Migration error for connector ${connector.id}:`, error);
      }

      console.log(''); // Empty line for readability
    }

  } catch (error) {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  } finally {
    // Note: Neo4j connection will close when process exits
    console.log('🔌 Closing database connection...');
  }

  const totalTime = Date.now() - startTime;
  
  console.log('\n📈 Migration Summary:');
  console.log(`   ✅ Successful migrations: ${successCount}`);
  console.log(`   ❌ Failed migrations: ${failureCount}`);
  console.log(`   ⏱️  Total time: ${totalTime}ms`);
  
  if (failureCount > 0) {
    console.log('\n⚠️  Some migrations failed. Please check the logs above and resolve any issues.');
    process.exit(1);
  } else {
    console.log('\n🎉 All Brave connectors successfully migrated to HTTP bridge!');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as migrateBraveConnectors };