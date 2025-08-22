// Migration 008: Add slug field to MCPServerOption nodes
// This migration adds Docker-compatible slug identifiers to existing MCP server options

// Add slug field to GitHub
MATCH (m:MCPServerOption {name: 'GitHub'})
SET m.slug = 'github';

// Add slug field to Puppeteer
MATCH (m:MCPServerOption {name: 'Puppeteer'})
SET m.slug = 'puppeteer';

// Add slug field to Filesystem
MATCH (m:MCPServerOption {name: 'Filesystem'})
SET m.slug = 'filesystem';

// Add slug field to Notion
MATCH (m:MCPServerOption {name: 'Notion'})
SET m.slug = 'notion';

// Add slug field to PostgreSQL
MATCH (m:MCPServerOption {name: 'PostgreSQL'})
SET m.slug = 'postgresql';

// Add slug field to Brave Search
MATCH (m:MCPServerOption {name: 'Brave Search'})
SET m.slug = 'brave';

// Add slug field to Google Drive
MATCH (m:MCPServerOption {name: 'Google Drive'})
SET m.slug = 'gdrive';

// Add slug field to Slack
MATCH (m:MCPServerOption {name: 'Slack'})
SET m.slug = 'slack';

// Add slug field to Memory
MATCH (m:MCPServerOption {name: 'Memory'})
SET m.slug = 'memory';

// Add slug field to Time
MATCH (m:MCPServerOption {name: 'Time'})
SET m.slug = 'time';

// Add slug field to Stripe
MATCH (m:MCPServerOption {name: 'Stripe'})
SET m.slug = 'stripe';

// Add slug field to SQLite (if exists from old migration)
MATCH (m:MCPServerOption {name: 'SQLite'})
SET m.slug = 'sqlite';

// Add slug field to Everything (if exists from old migration)
MATCH (m:MCPServerOption {name: 'Everything'})
SET m.slug = 'everything';

// Add slug field to Fetch (if exists from old migration)  
MATCH (m:MCPServerOption {name: 'Fetch'})
SET m.slug = 'fetch';

// Create index on slug field for better performance
CREATE INDEX mcp_server_slug_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.slug);

// Add uniqueness constraint on slug field
CREATE CONSTRAINT mcp_server_slug_unique IF NOT EXISTS FOR (m:MCPServerOption) REQUIRE m.slug IS UNIQUE;