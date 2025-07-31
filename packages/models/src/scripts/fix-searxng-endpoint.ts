#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function fixSearxngEndpoint() {
  console.log('🔧 Fixing Searxng endpoint configuration...\n');
  
  const connection = createConnection({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  
  await connection.connect();
  console.log('✅ Connected to Neo4j\n');
  
  await RepositoryFactory.initialize();
  
  const connectorRepo = new MCPServerConnectorRepository();
  const starshipId = 'e3c3bfea-ce12-45bf-b120-70f4bd423dad';
  
  try {
    // Find Searxng connector
    const connectors = await connectorRepo.findByStarship(starshipId);
    const searxngConnector = connectors.find(c => 
      c.dockerServiceName?.includes('searxng') || 
      c.templateId === '2329bdfd-e093-4237-a2ce-9d686cf57e62'
    );
    
    if (!searxngConnector) {
      console.log('❌ No Searxng connector found');
      return;
    }
    
    console.log(`📋 Found Searxng connector ${searxngConnector.id}`);
    
    // Update the environment variables to use a different Searxng instance
    // or add rate limit handling
    const currentEnv = searxngConnector.env ? JSON.parse(searxngConnector.env) : {};
    const updatedEnv = {
      ...currentEnv,
      SEARXNG_URL: 'https://priv.au/',  // Alternative instance
      SEARXNG_RATE_LIMIT_RETRY: 'true',
      SEARXNG_RATE_LIMIT_DELAY: '5000'
    };
    
    await connectorRepo.update(searxngConnector.id, {
      env: JSON.stringify(updatedEnv),
      errorMessage: undefined
    });
    
    console.log('✅ Updated Searxng configuration');
    console.log('ℹ️  Please restart the Searxng container for changes to take effect');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

fixSearxngEndpoint().catch(console.error);