#!/bin/sh
set -e

echo "Starting backend server with proper module resolution..."

# Set NODE_PATH to include all possible module locations
export NODE_PATH="/app/node_modules:/app/packages/server/node_modules:/app/packages/env-config/dist:/app/packages/core/dist:/app/packages/models/dist:/app/packages/protocol/dist:/app/packages/agent-engine/dist"

# Change to server directory
cd /app/packages/server

# Start the server
exec node dist/index.js