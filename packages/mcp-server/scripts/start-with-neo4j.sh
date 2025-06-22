#!/bin/bash

# Script to start MCP Server with Neo4j using Docker Compose

set -e

echo "🚀 Starting MCP Server with Neo4j..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install Docker Compose."
    exit 1
fi

# Navigate to the MCP server directory
cd "$(dirname "$0")/.."

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in $(pwd)"
    exit 1
fi

# Pull latest images
echo "📦 Pulling latest Neo4j image..."
docker-compose pull neo4j

# Build and start services
echo "🔧 Building and starting services..."
docker-compose up --build -d

# Wait for Neo4j to be ready
echo "⏳ Waiting for Neo4j to be ready..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if docker-compose exec neo4j cypher-shell -u neo4j -p mcppassword "RETURN 1;" &> /dev/null; then
        echo "✅ Neo4j is ready!"
        break
    fi
    
    echo "Waiting for Neo4j... ($counter/$timeout)"
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Neo4j failed to start within $timeout seconds"
    echo "📋 Checking logs..."
    docker-compose logs neo4j
    exit 1
fi

# Check if MCP server is ready
echo "⏳ Waiting for MCP Server to be ready..."
counter=0
while [ $counter -lt 30 ]; do
    if curl -f http://localhost:4000/ &> /dev/null; then
        echo "✅ MCP Server is ready!"
        break
    fi
    
    echo "Waiting for MCP Server... ($counter/30)"
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge 30 ]; then
    echo "❌ MCP Server failed to start within 30 seconds"
    echo "📋 Checking logs..."
    docker-compose logs mcp-server
    exit 1
fi

echo ""
echo "🎉 MCP Server with Neo4j is now running!"
echo ""
echo "📊 Neo4j Browser: http://localhost:7474"
echo "   Username: neo4j"
echo "   Password: mcppassword"
echo ""
echo "🖥️  MCP Server API: http://localhost:4000"
echo "   Test endpoint: http://localhost:4000/v1/agents"
echo ""
echo "📋 To view logs:"
echo "   docker-compose logs -f mcp-server"
echo "   docker-compose logs -f neo4j"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down" 