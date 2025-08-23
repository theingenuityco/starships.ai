#!/bin/sh
# Production startup script that runs built apps directly without pnpm

set -e

echo "Starting Starships.ai production services..."

# Export required environment variables
export NODE_ENV=production
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-dummy_stripe_key_for_mvp}"
export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY:-dummy_stripe_pub_key_for_mvp}"

# Ensure Kinde vars are set (they should be from the secret)
export KINDE_CLIENT_ID="${KINDE_CLIENT_ID}"
export KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET}"
export KINDE_ISSUER_URL="${KINDE_ISSUER_URL:-[KINDE-ISSUER-URL]}"
export KINDE_SITE_URL="${KINDE_SITE_URL:-[PROD-DOMAIN-URL]}"
export KINDE_POST_LOGIN_REDIRECT_URL="${KINDE_POST_LOGIN_REDIRECT_URL:-[PROD-DOMAIN-URL]/fleet}"
export KINDE_POST_LOGOUT_REDIRECT_URL="${KINDE_POST_LOGOUT_REDIRECT_URL:-[PROD-DOMAIN-URL]}"

# Start the Express backend
echo "Starting backend server..."
cd /app/packages/server
node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 5

# Start the Next.js frontend
echo "Starting frontend..."
cd /app/packages/client
npx next start -p 3000 &
FRONTEND_PID=$!

echo "Services started:"
echo "  - Frontend PID: $FRONTEND_PID (port 3000)"
echo "  - Backend PID: $BACKEND_PID (port 4000)"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID