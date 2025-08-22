// Migration 010: Add HTTP Bridge support fields to MCPServerConnector nodes
// This migration adds HTTP bridge specific fields to support HTTP-wrapped MCP servers

// Add HTTP bridge specific fields to all existing MCPServerConnector nodes
MATCH (c:MCPServerConnector)
SET 
    c.httpBridgeEnabled = false,
    c.internalUrl = null,
    c.bridgeVersion = null,
    c.lastToolsSync = null,
    c.availableTools = null,
    c.availableResources = null,
    c.bridgeCapabilities = null;

// Create index on httpBridgeEnabled for filtering HTTP bridge deployments
CREATE INDEX mcp_connector_http_bridge_enabled_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.httpBridgeEnabled);

// Create index on internalUrl for service discovery
CREATE INDEX mcp_connector_internal_url_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.internalUrl);

// Create composite index on starshipId and httpBridgeEnabled for efficient starship HTTP bridge queries
CREATE INDEX mcp_connector_starship_http_bridge_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.starshipId, c.httpBridgeEnabled);

// Create index on bridgeVersion for version tracking
CREATE INDEX mcp_connector_bridge_version_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.bridgeVersion);

// Create index on lastToolsSync for capability synchronization monitoring
CREATE INDEX mcp_connector_last_tools_sync_index IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.lastToolsSync);

// Create MCPServiceRegistry nodes for HTTP bridge service discovery
// Note: This creates the schema for service registry entries
CREATE CONSTRAINT mcp_service_registry_id_unique IF NOT EXISTS FOR (r:MCPServiceRegistry) REQUIRE r.id IS UNIQUE;

// Create index on starshipId for efficient starship service discovery
CREATE INDEX mcp_service_registry_starship_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.starshipId);

// Create index on connectorId for service-connector mapping
CREATE INDEX mcp_service_registry_connector_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.connectorId);

// Create composite index on starshipId and status for health monitoring
CREATE INDEX mcp_service_registry_starship_status_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.starshipId, r.status);

// Create index on templateSlug for template-based queries
CREATE INDEX mcp_service_registry_template_slug_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.templateSlug);

// Create index on containerName for container management
CREATE INDEX mcp_service_registry_container_name_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.containerName);

// Create index on internalUrl for direct service access
CREATE INDEX mcp_service_registry_internal_url_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.internalUrl);

// Create index on lastHealthCheck for health monitoring queries
CREATE INDEX mcp_service_registry_last_health_check_index IF NOT EXISTS FOR (r:MCPServiceRegistry) ON (r.lastHealthCheck);