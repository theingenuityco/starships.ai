# MCP Server Options Seeding

This document explains how to seed default MCP (Model Context Protocol) server options in the Starships.ai database.

## Overview

The MCP seeding system provides default connector configurations that users can select from when setting up their starships. This ensures that fresh databases have useful MCP server options available immediately.

## Files Created

### 1. Seed Script

- **File**: `src/scripts/seed-mcp-servers.ts`
- **Purpose**: Programmatically seeds default MCP server options
- **Features**:
  - Checks for existing servers to avoid duplicates
  - Creates 12 popular MCP server configurations
  - Provides detailed logging and error handling

### 2. Migration File

- **File**: `src/migrations/002_seed_mcp_server_options.cypher`
- **Purpose**: Cypher migration to seed MCP servers via database migration
- **Features**:
  - Uses MERGE to avoid duplicates
  - Creates indexes for better performance
  - Can be run as part of database migrations

### 3. Test Script

- **File**: `src/scripts/test-mcp-seeding.ts`
- **Purpose**: Tests the seeding functionality
- **Features**:
  - Queries before and after seeding
  - Verifies seeding worked correctly
  - Provides comprehensive test output

## Default MCP Servers

The following MCP servers are seeded by default:

1. **GitHub** - Docker-based GitHub integration
2. **Puppeteer** - Web automation and scraping
3. **Filesystem** - Local file system access
4. **SQLite** - SQLite database integration
5. **PostgreSQL** - PostgreSQL database integration
6. **Brave Search** - Web search via Brave API
7. **Google Drive** - Google Drive integration
8. **Slack** - Slack workspace integration
9. **Memory** - Persistent memory for conversations
10. **Everything** - Windows Everything search integration
11. **Fetch** - HTTP request capabilities
12. **Time** - Date and time utilities

## Usage

### Automatic Seeding (Recommended)

The seeding happens automatically when the server starts up. The server initialization includes:

```typescript
// Initialize MCP Server Options (seeds default connectors)
await seedMCPServers();
console.log('✅ MCP Server Options initialized with default connectors');
```

### Manual Seeding

You can manually run the seeding scripts:

```bash
# Seed MCP servers
cd packages/models
pnpm run seed:mcp

# Query existing MCP servers
pnpm run query:mcp

# Test the seeding functionality
pnpm run test:mcp-seeding
```

### Database Migration

You can also run the Cypher migration directly:

```bash
# Run the migration
cd packages/models
pnpm run migrate
```

## Environment Variables

The seeding scripts use the same environment variables as the main application:

```env
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[NEO4J-PASSWORD]
NEO4J_DATABASE=neo4j
```

## Configuration

Each MCP server option includes:

- **id**: Unique identifier (auto-generated UUID)
- **name**: Human-readable name
- **command**: Execution command (docker, npx, etc.)
- **args**: Command arguments array
- **env**: Environment variables as JSON string

### Example Configuration

```typescript
{
  name: 'GitHub',
  command: 'docker',
  args: ['run', '-i', '--rm', 'mcp/github'],
  env: JSON.stringify({
    GITHUB_PERSONAL_ACCESS_TOKEN: 'Your GitHub Personal Access Token'
  })
}
```

## Error Handling

The seeding system includes comprehensive error handling:

- **Duplicate Prevention**: Uses MERGE operations and name checking
- **Graceful Failures**: Individual server creation failures don't stop the entire process
- **Detailed Logging**: Provides clear success/failure messages
- **Database Connection**: Handles connection errors gracefully

## Integration with ConnectorSelector

The seeded MCP servers will automatically appear in the ConnectorSelector component:

1. **Fresh Database**: Shows all 12 default connectors
2. **Browse Connectors**: Button displays available options
3. **Environment Configuration**: Shows required environment variables
4. **Connection Status**: Displays connection state for each connector

## Troubleshooting

### No Connectors Appearing

1. Check if seeding ran successfully in server logs
2. Verify database connection
3. Run manual seeding: `pnpm run seed:mcp`
4. Query database: `pnpm run query:mcp`

### Seeding Errors

1. Check Neo4j connection settings
2. Verify database permissions
3. Check for schema initialization
4. Review error logs for specific issues

### Testing

Run the comprehensive test to verify everything works:

```bash
cd packages/models
pnpm run test:mcp-seeding
```

This will show before/after states and confirm seeding worked correctly.
