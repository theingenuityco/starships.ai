// Rollback Migration 010: Remove HTTP Bridge support fields from MCPServerConnector nodes
// This rollback removes HTTP bridge specific fields and service registry

// Remove HTTP bridge specific fields from all MCPServerConnector nodes
MATCH (c:MCPServerConnector)
REMOVE 
    c.httpBridgeEnabled,
    c.internalUrl,
    c.bridgeVersion,
    c.lastToolsSync,
    c.availableTools,
    c.availableResources,
    c.bridgeCapabilities;

// Drop HTTP bridge specific indexes
DROP INDEX mcp_connector_http_bridge_enabled_index IF EXISTS;
DROP INDEX mcp_connector_internal_url_index IF EXISTS;
DROP INDEX mcp_connector_starship_http_bridge_index IF EXISTS;
DROP INDEX mcp_connector_bridge_version_index IF EXISTS;
DROP INDEX mcp_connector_last_tools_sync_index IF EXISTS;

// Remove all MCPServiceRegistry nodes
MATCH (r:MCPServiceRegistry)
DELETE r;

// Drop MCPServiceRegistry constraints and indexes
DROP CONSTRAINT mcp_service_registry_id_unique IF EXISTS;
DROP INDEX mcp_service_registry_starship_index IF EXISTS;
DROP INDEX mcp_service_registry_connector_index IF EXISTS;
DROP INDEX mcp_service_registry_starship_status_index IF EXISTS;
DROP INDEX mcp_service_registry_template_slug_index IF EXISTS;
DROP INDEX mcp_service_registry_container_name_index IF EXISTS;
DROP INDEX mcp_service_registry_internal_url_index IF EXISTS;
DROP INDEX mcp_service_registry_last_health_check_index IF EXISTS;