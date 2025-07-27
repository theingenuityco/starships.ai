#!/bin/bash
# Test MCP Integration with Docker

echo "🧪 Testing MCP Integration with Docker..."
echo ""

# Check if Sequential Thinking server is running
echo "1️⃣ Checking Sequential Thinking Server..."
CONTAINER_NAME=$(docker ps --format "table {{.Names}}" | grep sequentialthinking | head -1)

if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ No Sequential Thinking server found running"
    echo "   To deploy one, use the API endpoint to create an MCP connector"
    exit 1
else
    echo "✅ Found container: $CONTAINER_NAME"
fi

# Get the port mapping
PORT=$(docker port $CONTAINER_NAME 8080 2>/dev/null | cut -d: -f2)
if [ -z "$PORT" ]; then
    echo "❌ No port mapping found for container"
    exit 1
else
    echo "✅ HTTP bridge available at: http://localhost:$PORT"
fi

# Test the health endpoint
echo ""
echo "2️⃣ Testing Health Endpoint..."
HEALTH=$(curl -s http://localhost:$PORT/health)
if [ $? -eq 0 ]; then
    echo "✅ Health check passed: $HEALTH"
else
    echo "❌ Health check failed"
    exit 1
fi

# Test tool discovery
echo ""
echo "3️⃣ Testing Tool Discovery..."
TOOLS=$(curl -s http://localhost:$PORT/tools | jq -r '.tools[].name' 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Discovered tools:"
    echo "$TOOLS" | sed 's/^/   - /'
else
    echo "❌ Tool discovery failed"
    exit 1
fi

# Test a simple Sequential Thinking invocation
echo ""
echo "4️⃣ Testing Sequential Thinking Invocation..."
RESPONSE=$(curl -s -X POST http://localhost:$PORT/tools/sequentialthinking \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "thought": "Testing MCP integration",
      "thoughtNumber": 1,
      "totalThoughts": 1,
      "nextThoughtNeeded": false
    }
  }')

if [ $? -eq 0 ]; then
    echo "✅ Tool invocation successful!"
    echo "   Response: $(echo $RESPONSE | jq -r '.result.thought' 2>/dev/null || echo $RESPONSE)"
else
    echo "❌ Tool invocation failed"
    exit 1
fi

echo ""
echo "✨ All MCP Docker tests passed!"
echo ""
echo "📝 Next steps:"
echo "   1. Create a test starship with MCP connectors"
echo "   2. Run agent tasks that use Sequential Thinking"
echo "   3. Monitor the tool usage in the logs"