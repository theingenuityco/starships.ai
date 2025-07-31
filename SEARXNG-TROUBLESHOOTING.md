# Searxng MCP Integration Troubleshooting Guide

## Current Issue

The Searxng MCP integration is experiencing issues with public Searxng instances:

### Error: "Method not found: GET /search"

This error occurs when the mcp-searxng package tries to query the Searxng API. The underlying issue is:

1. **Rate Limiting**: Public Searxng instances like `searx.stream` return "429 Too Many Requests"
2. **API Changes**: Some instances may have different API endpoints or require authentication
3. **Bot Protection**: Many instances have anti-bot protection (e.g., Cloudflare challenges)

## Solutions

### Option 1: Deploy Local Searxng Instance (Recommended)

Create a local Searxng instance that the MCP server can use:

```bash
# Create docker-compose file
docker-compose -f docker-compose.searxng.yml up -d

# The local instance will be available at http://localhost:8888
# MCP bridge will connect to it internally
```

### Option 2: Use Alternative Public Instances

Some alternative instances that might work:
- https://priv.au/
- https://search.bus-hit.me/
- https://searx.be/

To change the instance:

1. Edit `/packages/core/src/services/mcp/DockerServiceTemplate.ts`
2. Update the `MCP_SERVER_ARGS` to use a different URL
3. Rebuild and restart the services

### Option 3: Fix Rate Limiting

The mcp-searxng package (v0.5.0) doesn't handle rate limiting well. Potential fixes:

1. **Add retry logic**: Implement exponential backoff for 429 errors
2. **Use multiple instances**: Rotate between different Searxng instances
3. **Add caching**: Cache search results to reduce API calls

## Debugging Steps

1. **Check container logs**:
   ```bash
   docker logs $(docker ps -q -f name=searxng)
   ```

2. **Test the Searxng instance directly**:
   ```bash
   curl -I "https://your-instance.com/search?q=test&format=json"
   ```

3. **Test the MCP bridge**:
   ```bash
   curl -X POST http://localhost:8080/tools/searxng_web_search \
     -H "Content-Type: application/json" \
     -d '{"arguments": {"query": "test"}}'
   ```

## Known Limitations

1. **Public Instance Reliability**: Public Searxng instances are often unreliable due to:
   - Rate limiting
   - Bot protection
   - Downtime
   - API changes

2. **MCP Package Limitations**: The mcp-searxng package (v0.5.0) has limited error handling for:
   - Rate limiting (429 errors)
   - Network timeouts
   - Invalid responses

## Recommended Solution

For production use, deploy your own Searxng instance using the provided docker-compose file. This ensures:
- No rate limiting
- Consistent availability
- Full control over configuration
- Better performance

## Alternative Search Solutions

If Searxng continues to be problematic, consider:

1. **DuckDuckGo MCP**: More reliable but less privacy-focused
2. **Google Search MCP**: Requires API key but very reliable
3. **Brave Search MCP**: Good privacy and reliability balance

## Status

- Parameter mapping: ✅ Fixed
- Tool schema: ✅ Updated
- Public instance issues: ⚠️  Ongoing (rate limits, bot protection)
- Local instance: 🔧 Solution documented

## Next Steps

1. Deploy local Searxng instance for development
2. Consider implementing a more robust search MCP server
3. Add better error handling to the mcp-searxng package
4. Document instance requirements for production deployment