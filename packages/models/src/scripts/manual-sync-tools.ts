#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function manualSyncTools() {
  console.log('🔄 Manually syncing Searxng tools...\n');
  
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
  const connectorId = '9c3510a5-014e-41e2-83ef-12d9721535f6';
  
  try {
    // Define the tools that we know are available
    const tools = [
      {
        name: 'searxng_web_search',
        description: 'Performs a web search using the SearXNG API, ideal for general queries, news, articles, and online content. Use this for broad information gathering, recent events, or when you need diverse web sources.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
            pageno: { type: 'number', description: 'Page number (default: 1)', default: 1 },
            time_range: { type: 'string', description: 'Time range filter', enum: ['day', 'month', 'year'] },
            language: { type: 'string', description: 'Language code', default: 'all' },
            safesearch: { type: 'string', description: 'Safe search level (0-2)', enum: ['0', '1', '2'], default: '0' }
          },
          required: ['query']
        }
      },
      {
        name: 'web_url_read',
        description: 'Read the content from an URL. Use this for further information retrieving to understand the content of each URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to read' }
          },
          required: ['url']
        }
      }
    ];
    
    // Update connector with available tools (stringify for Neo4j)
    await connectorRepo.update(connectorId, {
      availableTools: JSON.stringify(tools),
      lastToolsSync: new Date().toISOString()
    });
    
    console.log(`✅ Synced ${tools.length} tools to connector`);
    
    // Verify
    const updated = await connectorRepo.findById(connectorId);
    if (updated) {
      console.log('\nConnector tools:', updated.availableTools);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

manualSyncTools().catch(console.error);