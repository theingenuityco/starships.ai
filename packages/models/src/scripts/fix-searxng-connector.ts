#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function fixSearxngConnector() {
  console.log('🔧 Fixing Searxng connector...\n');
  
  // Initialize database connection
  const connection = createConnection({
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  
  await connection.connect();
  console.log('✅ Connected to Neo4j\n');
  
  // Initialize repository factory
  await RepositoryFactory.initialize();
  
  const connectorRepo = new MCPServerConnectorRepository();
  const connectorId = '9c3510a5-014e-41e2-83ef-12d9721535f6';
  
  try {
    console.log(`📋 Fixing connector ${connectorId}...`);
    
    // Update connector to be active and connected
    const updated = await connectorRepo.updateStatus(
      connectorId,
      'active',
      undefined // no error message
    );
    
    if (updated) {
      console.log('✅ Updated connection status to connected');
      
      // Update HTTP bridge info using general update method
      await connectorRepo.update(
        connectorId,
        {
          httpBridgeEnabled: true,
          internalUrl: 'http://mcp-e3c3bfea-ce12-45bf-b120-70f4bd423dad-searxng-http:8080',
          bridgeVersion: '1.0.0',
          isActive: true
        }
      );
      console.log('✅ Updated HTTP bridge configuration');
      
      // Verify the fix
      const fixed = await connectorRepo.findById(connectorId);
      if (fixed) {
        console.log('\nConnector after fix:');
        console.log(`  Status: ${fixed.status}`);
        console.log(`  Is Active: ${fixed.isActive}`);
        console.log(`  HTTP Bridge: ${fixed.httpBridgeEnabled}`);
        console.log(`  Internal URL: ${fixed.internalUrl}`);
        console.log(`  Error: ${fixed.errorMessage || 'None'}`);
      }
    } else {
      console.log('❌ Failed to update connector');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the fix
fixSearxngConnector().catch(console.error);