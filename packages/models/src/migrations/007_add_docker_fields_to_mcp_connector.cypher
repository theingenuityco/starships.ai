// Migration 009: Add Docker-specific fields to MCPServerConnector nodes
// This migration adds Docker deployment fields to support containerized MCP servers

// Add Docker-specific fields to all existing MCPServerConnector nodes
MATCH (c:MCPServerConnector)
SET 
    c.dockerServiceName = null,
    c.dockerStatus = null,
    c.dockerContainerId = null,
    c.dockerHealthStatus = null,
    c.dockerLastHealthCheck = null,
    c.dockerNetworkName = null,
    c.dockerImageName = null,
    c.dockerErrorMessage = null;

// Create index on dockerStatus for efficient queries
CREATE INDEX mcp_connector_docker_status_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.dockerStatus);

// Create index on dockerHealthStatus for health monitoring queries
CREATE INDEX mcp_connector_docker_health_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.dockerHealthStatus);

// Create composite index on starshipId and dockerStatus for efficient starship queries
CREATE INDEX mcp_connector_starship_docker_status_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.starshipId, c.dockerStatus);

// Create index on dockerServiceName for container lookups
CREATE INDEX mcp_connector_docker_service_name_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.dockerServiceName);

// Create index on dockerContainerId for container management
CREATE INDEX mcp_connector_docker_container_id_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.dockerContainerId);