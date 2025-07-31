#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function updateSearxngConnector() {
  console.log('🔄 Updating Searxng connector...\n');
  
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
    // Find Searxng connector for the starship
    const connectors = await connectorRepo.findByStarship(starshipId);
    const searxngConnector = connectors.find(c => 
      c.dockerServiceName?.includes('searxng') || 
      c.templateId === '2329bdfd-e093-4237-a2ce-9d686cf57e62'
    );
    
    if (!searxngConnector) {
      console.log('❌ No Searxng connector found for starship');
      return;
    }
    
    console.log(`📋 Updating connector ${searxngConnector.id}...`);
    
    // Define the correct tools schema
    const tools = [
      {
        name: 'searxng_web_search',
        description: 'Performs a web search using the SearXNG API, ideal for general queries, news, articles, and online content. Use this for broad information gathering, recent events, or when you need diverse web sources.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'The search query. This is the main input for the web search' 
            },
            pageno: { 
              type: 'number', 
              description: 'Search page number (starts at 1)', 
              default: 1 
            },
            time_range: { 
              type: 'string', 
              description: 'Time range of search (day, month, year)', 
              enum: ['day', 'month', 'year'] 
            },
            language: { 
              type: 'string', 
              description: "Language code for search results (e.g., 'en', 'fr', 'de'). Default is instance-dependent.", 
              default: 'all' 
            },
            safesearch: { 
              type: 'string', 
              description: 'Safe search filter level (0: None, 1: Moderate, 2: Strict)', 
              enum: ['0', '1', '2'], 
              default: '0' 
            }
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
            url: { 
              type: 'string', 
              description: 'URL' 
            }
          },
          required: ['url']
        }
      }
    ];
    
    // Update connector
    await connectorRepo.update(searxngConnector.id, {
      status: 'active',
      isActive: true,
      dockerStatus: 'running',
      dockerHealthStatus: 'healthy',
      httpBridgeEnabled: true,
      internalUrl: `http://mcp-${starshipId}-searxng-http:8080`,
      bridgeVersion: '1.0.0',
      availableTools: JSON.stringify(tools),
      lastToolsSync: new Date().toISOString(),
      errorMessage: undefined
    });
    
    console.log('✅ Connector updated successfully');
    
    // Verify the update
    const updated = await connectorRepo.findById(searxngConnector.id);
    if (updated) {
      console.log('\nConnector status:');
      console.log(`  ID: ${updated.id}`);
      console.log(`  Status: ${updated.status}`);
      console.log(`  Is Active: ${updated.isActive}`);
      console.log(`  Docker Status: ${updated.dockerStatus}`);
      console.log(`  Health Status: ${updated.dockerHealthStatus}`);
      console.log(`  HTTP Bridge: ${updated.httpBridgeEnabled}`);
      console.log(`  Tools: ${updated.availableTools ? JSON.parse(updated.availableTools).length : 0} tools available`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

updateSearxngConnector().catch(console.error);