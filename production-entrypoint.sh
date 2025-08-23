#!/bin/sh
set -e

echo "Starting Starships.ai in production mode..."

# Start services directly with node (bypass pnpm)
echo "Starting backend server..."
cd /app/packages/server
node dist/index.js &

echo "Starting frontend..."
cd /app/packages/client
npm run start &

# Wait for all background processes
wait