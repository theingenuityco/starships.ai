#!/bin/sh
set -e

echo "Starting Starships.ai application..."

# Ensure builds inside the container have enough JS heap.
# You can override with NODE_OPTIONS and/or NODE_MAX_OLD_SPACE_SIZE.
DEFAULT_MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-8192}"
DEFAULT_NODE_OPTIONS="--no-node-snapshot --max-old-space-size=${DEFAULT_MAX_OLD_SPACE_SIZE}"

if [ -z "${NODE_OPTIONS:-}" ]; then
    export NODE_OPTIONS="${DEFAULT_NODE_OPTIONS}"
else
    case "${NODE_OPTIONS}" in
        *"--no-node-snapshot"*) ;;
        *) export NODE_OPTIONS="--no-node-snapshot ${NODE_OPTIONS}" ;;
    esac
    case "${NODE_OPTIONS}" in
        *"max-old-space-size="*) ;;
        *) export NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=${DEFAULT_MAX_OLD_SPACE_SIZE}" ;;
    esac
fi

# Runtime environment variables - Industry standard approach
# Secrets are injected at container runtime, not stored in the image
echo "Configuring runtime environment..."

# These secrets should be provided when running the container:
# docker run -e STRIPE_SECRET_KEY=xxx -e STRIPE_PUBLISHABLE_KEY=xxx image:tag
# or via Kubernetes secrets, or cloud provider secret managers

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

# Check if POSTGRES_HOST is already set (from K8s secrets or environment)
if [ -z "$POSTGRES_HOST" ]; then
    echo "ERROR: POSTGRES_HOST environment variable is not set!"
    echo "Please set POSTGRES_HOST in your environment or deployment configuration."
    exit 1
fi

echo "Using PostgreSQL host from environment: $POSTGRES_HOST"

# Use configured port or default
POSTGRES_CHECK_PORT=${POSTGRES_PORT:-5432}

# Wait for PostgreSQL (external) to be ready
echo "Waiting for PostgreSQL at $POSTGRES_HOST:$POSTGRES_CHECK_PORT..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if nc -z "$POSTGRES_HOST" "$POSTGRES_CHECK_PORT" 2>/dev/null; then
        echo "PostgreSQL is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "PostgreSQL failed to become ready after $max_attempts attempts"
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

# Ensure pnpm is available before starting concurrent processes
# This prevents race conditions where multiple processes try to download pnpm simultaneously
echo "Ensuring pnpm is ready..."
pnpm --version > /dev/null 2>&1

exec npx concurrently \
    --names "client,server,docs" \
    --prefix-colors "blue,green,yellow" \
    --kill-others \
    "pnpm --filter @starships/client start" \
    "pnpm --filter @starships/server start" \
    "pnpm --filter @starships/docs start"