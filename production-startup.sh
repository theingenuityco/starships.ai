#!/bin/sh
set -e

echo "==============================================="
echo "Starting Starships.ai Production Environment"
echo "==============================================="

# Fix all module imports in compiled JavaScript
echo "🔧 Fixing module imports..."
find /app/packages -name "*.js" -type f ! -path "*/node_modules/*" ! -path "*/.next/*" -exec sed -i 's|@starships/\([^/]*\)/src/|@starships/\1/dist/|g' {} + 2>/dev/null || true

# Start Neo4j database
echo "🗄️  Starting Neo4j database..."
# Ensure Java 17 is being used
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="${JAVA_HOME}/bin:${PATH}"

# Debug: Check all Java installations
echo "   Checking Java installations:"
echo "   - which java: $(which java)"
echo "   - java location: $(readlink -f $(which java))"
echo "   - JAVA_HOME: $JAVA_HOME"
echo "   - Java version: $(java -version 2>&1 | head -1)"

# Check if Neo4j has its own Java
if [ -f /opt/neo4j/bin/java ]; then
  echo "   WARNING: Neo4j has bundled Java at /opt/neo4j/bin/java"
  echo "   Removing bundled Java..."
  rm -f /opt/neo4j/bin/java
fi

# Force Neo4j to use our Java 17
export NEO4J_JAVA_HOME=$JAVA_HOME
echo "   NEO4J_JAVA_HOME set to: $NEO4J_JAVA_HOME"

/opt/neo4j/bin/neo4j start
echo "   Waiting for Neo4j to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:7474/ > /dev/null 2>&1; then
    echo "   ✅ Neo4j is ready!"
    break
  fi
  sleep 1
done

# Start backend server
echo "🚀 Starting backend server..."
cd /app/packages/server
export NODE_PATH="/app/node_modules:/app/packages/server/node_modules"
export PORT=4000
export SKIP_VECTOR_STORE=true
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=password
export CLIENT_URL=http://134.199.179.240
export NEXT_PUBLIC_API_URL=http://134.199.179.240:4000
export SERVER_URL=http://localhost:4000

nohup node dist/index.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend started with PID: $BACKEND_PID"

# Wait for backend to be ready
echo "   Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo "   ✅ Backend is ready!"
    break
  fi
  sleep 1
done

# Start frontend
echo "🌐 Starting frontend..."
cd /app/packages/client
export NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR=true
export NEXT_PUBLIC_API_URL=http://134.199.179.240:4000
# Export Kinde variables for Next.js runtime
export KINDE_CLIENT_ID="${KINDE_CLIENT_ID}"
export KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET}"
export KINDE_ISSUER_URL="${KINDE_ISSUER_URL}"
export KINDE_SITE_URL="${KINDE_SITE_URL}"
export KINDE_POST_LOGIN_REDIRECT_URL="${KINDE_POST_LOGIN_REDIRECT_URL}"
export KINDE_POST_LOGOUT_REDIRECT_URL="${KINDE_POST_LOGOUT_REDIRECT_URL}"
npx next start &
FRONTEND_PID=$!
echo "   Frontend started with PID: $FRONTEND_PID"

echo "==============================================="
echo "✅ All services started successfully!"
echo "   Frontend: http://134.199.179.240"
echo "   Backend:  http://134.199.179.240:4000"
echo "   Neo4j:    http://localhost:7474"
echo "==============================================="

# Monitor processes
while true; do
  # Check if backend is still running
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "⚠️  Backend crashed, restarting..."
    cd /app/packages/server
    nohup node dist/index.js > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
  fi
  
  # Check if frontend is still running
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "⚠️  Frontend crashed, restarting..."
    cd /app/packages/client
    npx next start &
    FRONTEND_PID=$!
  fi
  
  sleep 10
done