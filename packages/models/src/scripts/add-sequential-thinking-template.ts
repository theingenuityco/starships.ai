#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';

async function addSequentialThinkingTemplate() {
  console.log('🚀 Adding Sequential Thinking MCP template to database...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Create or update the sequential thinking template
    const templateQuery = `
      MERGE (t:MCPServerTemplate {
        id: 'sequentialthinking',
        slug: 'sequentialthinking'
      })
      SET 
        t.name = 'Sequential Thinking',
        t.description = 'MCP server for sequential thinking and reasoning capabilities',
        t.version = '1.0.0',
        t.dockerImage = 'starships/mcp-http-bridge:latest',
        t.dockerCommand = 'node /app/server.js',
        t.envPrefix = 'SEQUENTIAL_',
        t.ports = ['8080'],
        t.environmentJson = '{"MCP_SERVER_CMD":"npx","MCP_SERVER_ARGS":"-y @modelcontextprotocol/server-sequential-thinking","HTTP_PORT":"8080","LOG_LEVEL":"info","HEALTH_CHECK_TIMEOUT":"15000","MAX_CONCURRENT_REQUESTS":"10"}',
        t.healthcheckJson = '{"test":["CMD","curl","-f","http://localhost:8080/health"],"interval":"30s","timeout":"10s","retries":3,"start_period":"15s"}',
        t.resourceLimitsJson = '{"cpus":"0.3","memory":"256M"}',
        t.labelsJson = '{"mcpType":"sequentialthinking","mcpProtocol":"http","mcpRuntime":"bridge","mcpVersion":"1.0.0"}',
        t.bridgeConfigJson = '{"useHttpBridge":true,"apiKeyRequired":false,"healthCheckMethod":"tools_list","mcpServerCmd":"npx","mcpServerArgs":["-y","@modelcontextprotocol/server-sequential-thinking"]}',
        t.requiresFileAccess = false,
        t.requiresCredentials = false,
        t.category = 'reasoning',
        t.tags = ['reasoning', 'thinking', 'analysis'],
        t.isActive = true,
        t.updatedAt = datetime()
      RETURN t
    `;

    console.log('📝 Creating Sequential Thinking template...');
    const result = await connection.executeWrite(templateQuery);
    
    console.log('✅ Sequential Thinking template created/updated successfully!');

    // Verify the template was created
    const verifyQuery = `
      MATCH (t:MCPServerTemplate {slug: 'sequentialthinking'})
      RETURN t.id, t.name, t.description, t.version, t.category
    `;

    const verifyResult = await connection.executeQuery(verifyQuery);
    
    if (verifyResult.length > 0) {
      const template = verifyResult[0];
      console.log('🔍 Template verification:');
      console.log(`   ID: ${template['t.id']}`);
      console.log(`   Name: ${template['t.name']}`);
      console.log(`   Description: ${template['t.description']}`);
      console.log(`   Version: ${template['t.version']}`);
      console.log(`   Category: ${template['t.category']}`);
    }

    // Check if any existing connectors can be migrated to this template
    const existingConnectorsQuery = `
      MATCH (c:MCPServerConnector)
      WHERE c.dockerServiceName CONTAINS 'sequential'
         OR c.dockerServiceName CONTAINS 'thinking'
         OR c.templateSlug = 'sequentialthinking'
      RETURN count(c) as existingConnectors
    `;

    const existingResult = await connection.executeQuery(existingConnectorsQuery);
    if (existingResult.length > 0 && existingResult[0].existingConnectors > 0) {
      console.log(`📊 Found ${existingResult[0].existingConnectors} existing connectors that might use this template`);
    } else {
      console.log('📊 No existing connectors found for this template');
    }

    console.log('🎉 Sequential Thinking template addition completed!');

  } catch (error) {
    console.error('❌ Failed to add Sequential Thinking template:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run if this script is executed directly
if (require.main === module) {
  addSequentialThinkingTemplate().catch(console.error);
}

export { addSequentialThinkingTemplate };