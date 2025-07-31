#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function recreateSearxngConnector() {
  console.log('🔄 Recreating Searxng connector with new configuration...\n');
  
  const connection = createConnection({
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  
  await connection.connect();
  console.log('✅ Connected to Neo4j\n');
  
  await RepositoryFactory.initialize();
  
  const connectorRepo = new MCPServerConnectorRepository();
  const starshipId = 'e3c3bfea-ce12-45bf-b120-70f4bd423dad';
  
  try {
    // Find existing Searxng connector
    const connectors = await connectorRepo.findByStarship(starshipId);
    const searxngConnector = connectors.find(c => 
      c.dockerServiceName?.includes('searxng') || 
      c.templateId === '2329bdfd-e093-4237-a2ce-9d686cf57e62'
    );
    
    if (searxngConnector) {
      console.log(`📋 Found existing connector ${searxngConnector.id}`);
      console.log(`🗑️  Deleting old connector...`);
      
      // Stop the container first
      const { exec } = require('child_process');
      const containerName = searxngConnector.dockerServiceName || `mcp-${starshipId}-searxng-http`;
      
      await new Promise((resolve) => {
        exec(`docker stop ${containerName} && docker rm ${containerName}`, (error: any) => {
          if (error) {
            console.log(`⚠️  Container might not exist or already stopped`);
          }
          resolve(null);
        });
      });
      
      // Delete the connector from database
      await connectorRepo.delete(searxngConnector.id);
      console.log('✅ Old connector deleted');
    }
    
    console.log('\n🆕 Creating new Searxng connector...');
    console.log('ℹ️  The connector will be created when you select Searxng from the UI');
    console.log('ℹ️  The new configuration will use an alternative Searxng instance');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

recreateSearxngConnector().catch(console.error);