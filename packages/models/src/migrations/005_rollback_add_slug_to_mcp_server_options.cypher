// Rollback Migration 008: Remove slug field from MCPServerOption nodes
// This rollback removes the slug field and related constraints/indexes

// Drop uniqueness constraint on slug field
DROP CONSTRAINT mcp_server_slug_unique IF EXISTS;

// Drop index on slug field
DROP INDEX mcp_server_slug_index IF EXISTS;

// Remove slug field from all MCPServerOption nodes
MATCH (m:MCPServerOption)
REMOVE m.slug;