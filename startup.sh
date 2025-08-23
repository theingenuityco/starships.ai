#!/bin/sh
set -e

echo "Starting Starships.ai in production mode..."

# Start backend server
echo "Starting backend server..."
/app/backend-startup.sh &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# Start frontend
echo "Starting frontend..."
cd /app/packages/client
npx next start &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Monitor both processes
while true; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Backend process died, restarting..."
        cd /app/packages/server
        node dist/index.js &
        BACKEND_PID=$!
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Frontend process died, restarting..."
        cd /app/packages/client
        npx next start &
        FRONTEND_PID=$!
    fi
    
    sleep 5
done