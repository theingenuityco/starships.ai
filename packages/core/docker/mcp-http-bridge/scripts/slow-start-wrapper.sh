#!/bin/sh
# Wrapper script for MCP servers that need extra initialization time

# Function to wait for server readiness
wait_for_server() {
    local max_attempts=30
    local attempt=0
    
    echo "[SlowStartWrapper] Waiting for MCP server to be ready..."
    
    # Give the server time to download dependencies
    if [ "$NPX_DOWNLOAD_TIMEOUT" ]; then
        echo "[SlowStartWrapper] Allowing $NPX_DOWNLOAD_TIMEOUT ms for package download..."
        sleep $((NPX_DOWNLOAD_TIMEOUT / 1000))
    fi
    
    # Start the actual MCP server in background
    exec "$@" &
    SERVER_PID=$!
    
    # Wait for server to be ready
    while [ $attempt -lt $max_attempts ]; do
        if kill -0 $SERVER_PID 2>/dev/null; then
            attempt=$((attempt + 1))
            sleep 3
        else
            echo "[SlowStartWrapper] Server process exited unexpectedly"
            exit 1
        fi
    done
    
    # Keep the wrapper running
    wait $SERVER_PID
}

# Execute with timeout handling
wait_for_server "$@"