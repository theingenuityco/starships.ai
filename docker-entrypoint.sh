#!/bin/sh
set -e

echo "Starting Starships.ai application..."

# Runtime environment variables - Industry standard approach
# Secrets are injected at container runtime, not stored in the image
echo "Configuring runtime environment..."

# These secrets should be provided when running the container:
# docker run -e STRIPE_SECRET_KEY=xxx -e STRIPE_PUBLISHABLE_KEY=xxx image:tag
# or via Kubernetes secrets, Docker Compose, or cloud provider secret managers

if [ -z "$STRIPE_PUBLISHABLE_KEY" ]; then
    echo "WARNING: STRIPE_PUBLISHABLE_KEY not provided. Payment UI may not work."
    echo "Please provide it as an environment variable when running the container."
fi

if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo "WARNING: STRIPE_SECRET_KEY not provided. Payment functionality may not work."
    echo "Please provide it as an environment variable when running the container."
fi

# Export runtime secrets for the application
export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY:-}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"

# Check if NEO4J_URI is already set (from K8s secrets, docker-compose, or environment)
if [ -n "$NEO4J_URI" ]; then
    echo "Using Neo4j URI from environment: $NEO4J_URI"
    
    # Check if it's localhost - then we need to start internal Neo4j
    if echo "$NEO4J_URI" | grep -q "localhost\|127.0.0.1"; then
        echo "Neo4j URI points to localhost, starting internal Neo4j..."
        
        # Check if supervisor is managing Neo4j (when running with supervisor)
        if [ -f /var/run/supervisord.pid ]; then
            echo "Neo4j is managed by supervisor"
        else
            echo "Starting Neo4j manually..."
            # Start Neo4j in background if not using supervisor
            /opt/neo4j/bin/neo4j start
        fi
        
        # Extract port from NEO4J_URI for health check
        NEO4J_CHECK_PORT=$(echo "$NEO4J_URI" | sed 's/.*://' | sed 's/\/.*//')
        
        # Wait for internal Neo4j to be ready
        echo "Waiting for internal Neo4j to start on port $NEO4J_CHECK_PORT..."
        max_attempts=60
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if nc -z localhost "$NEO4J_CHECK_PORT" 2>/dev/null; then
                echo "Internal Neo4j is ready!"
                break
            fi
            attempt=$((attempt + 1))
            echo "Waiting for Neo4j... (attempt $attempt/$max_attempts)"
            sleep 2
        done
        
        if [ $attempt -eq $max_attempts ]; then
            echo "Internal Neo4j failed to start after $max_attempts attempts"
            exit 1
        fi
    else
        echo "Neo4j URI points to external service: $NEO4J_URI"
        echo "Skipping internal Neo4j startup..."
    fi
else
    echo "ERROR: NEO4J_URI environment variable is not set!"
    echo "Please set NEO4J_URI in your environment or deployment configuration."
    exit 1
fi

# Display Neo4j connection info
echo "========================================="
echo "Neo4j Configuration:"
echo "  URI: $NEO4J_URI"
echo "  Username: ${NEO4J_USERNAME}"
echo "  Database: ${NEO4J_DATABASE}"
echo "========================================="

# Skip installation and building in production since it's done in Dockerfile
if [ "$NODE_ENV" != "production" ]; then
    # Check if node_modules exists, if not install dependencies
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        pnpm install --frozen-lockfile
    fi

    # Check if packages are built, if not build them
    if [ ! -d "packages/server/dist" ] || [ ! -d "packages/client/.next" ]; then
        echo "Building all packages (frontend and backend)..."
        pnpm run build
    fi
fi

# Run any database migrations if needed
if [ -f "packages/models/src/scripts/migration-runner.ts" ]; then
    echo "Running database migrations..."
    cd packages/models && npx tsx src/scripts/migration-runner.ts || true
    cd /app
fi

# Start both frontend and backend services concurrently
echo "Starting all application services..."

# Extract ports from existing environment variables if available
if [ -n "$CLIENT_URL" ]; then
    echo "  - Frontend: $CLIENT_URL"
else
    # Extract port from CLIENT_URL if possible, otherwise use PORT env var
    if [ -n "$PORT" ]; then
        echo "  - Frontend on port $PORT"
    else
        echo "  - Frontend service starting..."
    fi
fi

if [ -n "$NEXT_PUBLIC_API_URL" ]; then
    echo "  - Backend API: $NEXT_PUBLIC_API_URL"
elif [ -n "$SERVER_URL" ]; then
    echo "  - Backend: $SERVER_URL"
else
    # No hardcoded fallback - must be configured
    echo "  - Backend service starting..."
fi

# Check if Neo4j is running locally and extract port from URI
if echo "$NEO4J_URI" | grep -q "localhost\|127.0.0.1"; then
    # Extract port from NEO4J_URI (e.g., bolt://localhost:7687 -> 7687)
    NEO4J_PORT=$(echo "$NEO4J_URI" | sed 's/.*://' | sed 's/\/.*//')
    # Neo4j Browser is typically on port-100 (7687->7587) or could be on 7474
    echo "  - Neo4j at: $NEO4J_URI"
fi

exec npx concurrently \
    --names "client,server" \
    --prefix-colors "blue,green" \
    --kill-others \
    "pnpm --filter @starships/client start" \
    "pnpm --filter @starships/server start"