# Searxng MCP Connector Fix Guide

## After Restarting Containers

When you restart the containers, follow these steps to ensure the Searxng connector works properly:

### 1. Start the services
```bash
pnpm run dev
```

### 2. Wait for services to be ready
Wait for the server to show it's accepting connections (you'll see logs like "Server running on port 4000")

### 3. Update the Searxng connector in the database
In a new terminal, run:
```bash
cd packages/models
npx tsx src/scripts/update-searxng-connector.ts
```

This script will:
- Find the Searxng connector for your starship
- Update its status to active
- Set the correct tool schemas
- Configure the HTTP bridge settings

### 4. Test the Searxng functionality
You can now chat with your agent and ask it to search for information.

## What Was Fixed

1. **Parameter Mapping**: The MCPToolWrapper now correctly maps string inputs to the required parameter format
   - When the agent sends just "search query", it gets mapped to `{query: "search query"}`

2. **Tool Schema**: Updated the Searxng tool schemas to match what the actual MCP server expects
   - Fixed data types (number vs integer, string enums for safesearch)
   - Added default values

3. **Better Logging**: Added more detailed logging for Searxng tools to help diagnose issues

## Troubleshooting

If you still see errors:

1. Check if the Searxng container is running:
   ```bash
   docker ps | grep searxng
   ```

2. Check the container logs:
   ```bash
   docker logs <searxng-container-name>
   ```

3. Verify the connector status:
   ```bash
   cd packages/models
   npx tsx src/scripts/check-searxng-connector.ts
   ```

## Known Limitations

- The `web_url_read` tool may fail on some websites that block automated requests
- This is expected behavior - the agent should suggest using web search instead