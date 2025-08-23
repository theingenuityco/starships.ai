#!/bin/bash

echo "🚀 Starting Neo4j locally for development..."

# Stop and remove any existing container
docker stop starships-neo4j 2>/dev/null || true
docker rm starships-neo4j 2>/dev/null || true

# Start Neo4j container
docker run -d \
  --name starships-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/mcppassword \
  -e NEO4J_PLUGINS='["apoc"]' \
  -e NEO4J_dbms_memory_heap_initial__size=512m \
  -e NEO4J_dbms_memory_heap_max__size=1G \
  -e NEO4J_dbms_memory_pagecache_size=512m \
  -v starships-neo4j-data:/data \
  -v starships-neo4j-logs:/logs \
  neo4j:5.9.0

echo "⏳ Waiting for Neo4j to start..."
sleep 5

# Check if Neo4j is running
for i in {1..30}; do
  if curl -s http://localhost:7474 > /dev/null 2>&1; then
    echo "✅ Neo4j is running!"
    echo "   Web interface: http://localhost:7474"
    echo "   Bolt URL: bolt://localhost:7687"
    echo "   Username: neo4j"
    echo "   Password: mcppassword"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo "❌ Neo4j failed to start. Check logs with: docker logs starships-neo4j"
exit 1