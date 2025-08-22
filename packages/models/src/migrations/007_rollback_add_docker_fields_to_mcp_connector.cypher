// Rollback Migration 009: Remove Docker-specific fields from MCPServerConnector nodes
// This rollback removes Docker deployment fields from MCPServerConnector nodes

// Drop indexes created for Docker fields
DROP INDEX mcp_connector_docker_status_index IF EXISTS;
DROP INDEX mcp_connector_docker_health_index IF EXISTS;
DROP INDEX mcp_connector_starship_docker_status_index IF EXISTS;
DROP INDEX mcp_connector_docker_service_name_index IF EXISTS;
DROP INDEX mcp_connector_docker_container_id_index IF EXISTS;

// Remove Docker-specific fields from all MCPServerConnector nodes
MATCH (c:MCPServerConnector)
REMOVE c.dockerServiceName,
       c.dockerStatus,
       c.dockerContainerId,
       c.dockerHealthStatus,
       c.dockerLastHealthCheck,
       c.dockerNetworkName,
       c.dockerImageName,
       c.dockerErrorMessage;