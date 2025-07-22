/**
 * Starships.ai Server Startup
 * Handles server initialization and database connections
 */

import { createServer } from 'http';
import { initializeSocketIO } from './socket';
import { createConnection, RepositoryFactory } from '@starships/models';
import { seedMCPServers } from '@starships/models/src/scripts/seed-mcp-servers';
import { AgentService } from './services/AgentService';
import { app } from './index';

const PORT = process.env.PORT || 3001;

// Initialize Neo4j database connection
const dbConnection = createConnection({
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password',
  database: process.env.NEO4J_DATABASE || 'neo4j',
});

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO
const socketService = initializeSocketIO(httpServer);

// Start server
httpServer.listen(PORT, async () => {
  try {
    // Initialize database connection
    await dbConnection.connect();
    await dbConnection.initializeSchema();
    console.log('✅ Neo4j database connected and schema initialized');
    
    // Initialize RepositoryFactory BEFORE any socket connections
    console.log('🔧 Initializing RepositoryFactory...');
    await RepositoryFactory.initialize();
    console.log('✅ RepositoryFactory initialized - all repositories ready for socket operations');
    
    // Initialize AgentService (seeds default agents)
    await AgentService.initialize();
    console.log('✅ AgentService initialized with default agents');

    // Initialize AgentTemplateService (seeds default templates)
    const templateService = RepositoryFactory.getAgentTemplateService();
    if (templateService) {
      await templateService.seedDefaultTemplates();
      console.log('✅ AgentTemplateService initialized with default templates');
    } else {
      console.warn('⚠️ AgentTemplateService not available - database connection may be unavailable');
    }

    // Initialize MCP Server Options (seeds default connectors)
    await seedMCPServers();
    console.log('✅ MCP Server Options initialized with default connectors');

    // Initialize MCPServerConnectorRepository (validate schema and constraints)
    try {
      const connectorCount = await mcpServerConnectorRepository
        .findAll()
        .then((connectors) => connectors.length);
      console.log(
        `✅ MCPServerConnectorRepository initialized with ${connectorCount} existing connector instances`
      );
    } catch (error) {
      console.error('❌ Failed to initialize MCPServerConnectorRepository:', error);
      // Don't exit - this is not critical for server startup
    }

    // Log Socket.IO status
    console.log('✅ Socket.IO server initialized');
    console.log(`📡 WebSocket connections: ${socketService.getConnectedUsersCount()}`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }

  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
  console.log(`🛸 Starships ready for launch!`);
});

export { httpServer, socketService, dbConnection };