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

# Check if POSTGRES_HOST is already set (from K8s secrets, docker-compose, or environment)
if [ -n "$POSTGRES_HOST" ]; then
    echo "Using PostgreSQL host from environment: $POSTGRES_HOST"
    
    # Check if it's localhost - then we need to start internal PostgreSQL
    if echo "$POSTGRES_HOST" | grep -q "localhost\|127.0.0.1"; then
        echo "PostgreSQL host points to localhost, starting internal PostgreSQL..."
        
        # Ensure PostgreSQL runtime directory exists
        mkdir -p /run/postgresql /var/log/postgresql
        chown -R postgres:postgres /run/postgresql /var/log/postgresql
        chmod 775 /run/postgresql
        
        # Check if supervisor is managing PostgreSQL (when running with supervisor)
        if [ -f /var/run/supervisord.pid ]; then
            echo "PostgreSQL is managed by supervisor"
        else
            echo "Starting PostgreSQL manually..."
            # Start PostgreSQL in background if not using supervisor
            su postgres -c 'pg_ctl start -D /var/lib/postgresql/data' || true
        fi
        
        # Use configured port or default
        POSTGRES_CHECK_PORT=${POSTGRES_PORT:-5432}
        
        # Wait for internal PostgreSQL to be ready
        echo "Waiting for internal PostgreSQL to start on port $POSTGRES_CHECK_PORT..."
        max_attempts=30
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if nc -z localhost "$POSTGRES_CHECK_PORT" 2>/dev/null; then
                echo "Internal PostgreSQL is ready!"
                break
            fi
            attempt=$((attempt + 1))
            echo "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
            sleep 2
        done
        
        if [ $attempt -eq $max_attempts ]; then
            echo "Internal PostgreSQL failed to start after $max_attempts attempts"
            exit 1
        fi
    else
        echo "PostgreSQL host points to external service: $POSTGRES_HOST"
        echo "Skipping internal PostgreSQL startup..."
    fi
else
    echo "ERROR: POSTGRES_HOST environment variable is not set!"
    echo "Please set POSTGRES_HOST in your environment or deployment configuration."
    exit 1
fi

# Display PostgreSQL connection info
echo "========================================="
echo "PostgreSQL Configuration:"
echo "  Host: $POSTGRES_HOST"
echo "  Port: ${POSTGRES_PORT:-5432}"
echo "  User: ${POSTGRES_USER:-postgres}"
echo "  Database: ${POSTGRES_DATABASE:-starships}"
echo "  SSL: ${POSTGRES_SSL:-false}"
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

# Runtime configuration: SERVER_URL is now used for both REST API and WebSocket connections
# This replaces the previous dual configuration (API_URL and SERVER_URL)
if [ -n "$SERVER_URL" ]; then
    echo "  - Backend Server: $SERVER_URL (REST API and WebSocket)"
elif [ -n "$NEXT_PUBLIC_API_URL" ]; then
    # Legacy support for NEXT_PUBLIC_API_URL
    echo "  - Backend API (Legacy): $NEXT_PUBLIC_API_URL"
else
    # No hardcoded fallback - must be configured
    echo "  - Backend service starting..."
fi

# Check if PostgreSQL is running locally
if echo "$POSTGRES_HOST" | grep -q "localhost\|127.0.0.1"; then
    # Use configured port or default
    POSTGRES_PORT_DISPLAY=${POSTGRES_PORT:-5432}
    echo "  - PostgreSQL at: $POSTGRES_HOST:$POSTGRES_PORT_DISPLAY"
fi

exec npx concurrently \
    --names "client,server" \
    --prefix-colors "blue,green" \
    --kill-others \
    "pnpm --filter @starships/client start" \
    "pnpm --filter @starships/server start"