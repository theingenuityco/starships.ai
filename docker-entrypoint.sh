#!/bin/sh
set -e

echo "Starting Starships.ai application..."

# Runtime environment variables - Industry standard approach
# Secrets are injected at container runtime, not stored in the image
echo "Configuring runtime environment..."

# These secrets should be provided when running the container:
# docker run -e STRIPE_SECRET_KEY=xxx image:tag
# or via Kubernetes secrets, Docker Compose, or cloud provider secret managers

if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo "WARNING: STRIPE_SECRET_KEY not provided. Payment functionality may not work."
    echo "Please provide it as an environment variable when running the container."
fi

# Export runtime secrets for the application
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"

# Check if we should use external Neo4j (e.g., Neo4j Aura)
if [ -n "$NEO4J_EXTERNAL_URI" ]; then
    echo "Using external Neo4j database at: $NEO4J_EXTERNAL_URI"
    echo "Skipping internal Neo4j startup..."
    
    # Test connection to external Neo4j
    echo "Testing connection to external Neo4j..."
    max_attempts=30
    attempt=0
    
    # Extract host and port from URI (e.g., neo4j+s://xxx.databases.neo4j.io)
    # For Aura, we just check if the URI is valid, as it uses neo4j+s:// protocol
    if echo "$NEO4J_EXTERNAL_URI" | grep -q "neo4j+s://"; then
        echo "Neo4j Aura connection detected. Proceeding with secure connection..."
        # For Aura, we assume it's ready as it's a managed service
        NEO4J_URI="$NEO4J_EXTERNAL_URI"
        export NEO4J_URI
    else
        # For standard bolt connections, extract host and port
        NEO4J_HOST=$(echo "$NEO4J_EXTERNAL_URI" | sed 's|bolt://||' | cut -d: -f1)
        NEO4J_PORT=$(echo "$NEO4J_EXTERNAL_URI" | sed 's|bolt://||' | cut -d: -f2 | cut -d/ -f1)
        
        while [ $attempt -lt $max_attempts ]; do
            if nc -z "$NEO4J_HOST" "$NEO4J_PORT" 2>/dev/null; then
                echo "External Neo4j is reachable!"
                break
            fi
            attempt=$((attempt + 1))
            echo "Waiting for external Neo4j... (attempt $attempt/$max_attempts)"
            sleep 2
        done
        
        if [ $attempt -eq $max_attempts ]; then
            echo "WARNING: Could not reach external Neo4j at $NEO4J_EXTERNAL_URI"
            echo "Continuing anyway as it might be accessible from the application..."
        fi
        
        NEO4J_URI="$NEO4J_EXTERNAL_URI"
        export NEO4J_URI
    fi
else
    echo "Using internal Neo4j database..."
    
    # Check if supervisor is managing Neo4j (when running with supervisor)
    if [ -f /var/run/supervisord.pid ]; then
        echo "Neo4j is managed by supervisor"
    else
        echo "Starting Neo4j manually..."
        # Start Neo4j in background if not using supervisor
        /opt/neo4j/bin/neo4j start
    fi
    
    # Wait for internal Neo4j to be ready
    echo "Waiting for internal Neo4j to start on localhost:7687..."
    max_attempts=60
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost 7687 2>/dev/null; then
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
    
    # Use internal Neo4j
    NEO4J_URI="[NEO4J-LOCAL-URL]"
    export NEO4J_URI
fi

# Display Neo4j connection info
echo "========================================="
echo "Neo4j Configuration:"
echo "  URI: $NEO4J_URI"
echo "  Username: ${NEO4J_USERNAME:-neo4j}"
echo "  Database: ${NEO4J_DATABASE:-neo4j}"
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
echo "  - Frontend on http://localhost:3000"
echo "  - Backend on http://localhost:4000"
if [ -z "$NEO4J_EXTERNAL_URI" ]; then
    echo "  - Neo4j Browser on http://localhost:7474"
fi

exec npx concurrently \
    --names "client,server" \
    --prefix-colors "blue,green" \
    --kill-others \
    "pnpm --filter @starships/client start" \
    "pnpm --filter @starships/server start"