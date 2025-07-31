#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function checkSearxngConnector() {
  console.log('🔍 Checking Searxng connector...\n');
  
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
  const starshipId = 'e3c3bfea-ce12-45bf-b120-70f4bd423dad';
  
  try {
    // Find all connectors for the starship
    console.log(`📋 Finding all connectors for starship ${starshipId}...`);
    const connectors = await connectorRepo.findByStarship(starshipId);
    console.log(`Found ${connectors.length} connectors:\n`);
    
    connectors.forEach(connector => {
      console.log(`Connector: ${connector.id}`);
      console.log(`  Template: ${connector.templateId}`);
      console.log(`  Docker Status: ${connector.dockerStatus}`);
      console.log(`  Docker Service: ${connector.dockerServiceName}`);
      console.log(`  HTTP Bridge: ${connector.httpBridgeEnabled}`);
      console.log(`  Internal URL: ${connector.internalUrl}`);
      console.log(`  Created: ${connector.createdAt}`);
      console.log('');
    });
    
    // Check specific Searxng connector
    const searxngConnector = connectors.find(c => 
      c.dockerServiceName?.includes('searxng') || 
      c.id === '9c3510a5-014e-41e2-83ef-12d9721535f6'
    );
    
    if (searxngConnector) {
      console.log('✅ Found Searxng connector:', searxngConnector.id);
      console.log('  Checking connector details...');
      
      // Get full connector details
      const fullConnector = await connectorRepo.findById(searxngConnector.id);
      if (fullConnector) {
        console.log('  Full details:', JSON.stringify(fullConnector, null, 2));
      }
    } else {
      console.log('❌ No Searxng connector found for this starship');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the check
checkSearxngConnector().catch(console.error);