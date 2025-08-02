#!/bin/bash

# Build script for MCP HTTP Bridge Docker image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
IMAGE_NAME="starships/mcp-http-bridge"
VERSION="${1:-latest}"
PLATFORM="${2:-linux/amd64,linux/arm64}"

echo "Building MCP HTTP Bridge Docker image..."
echo "Image: $IMAGE_NAME:$VERSION"
echo "Platform: $PLATFORM"
echo "Directory: $SCRIPT_DIR"

# Copy the HttpBridge.ts file and compile it
echo "Preparing TypeScript files..."

# Create a temporary build directory
BUILD_DIR="$(mktemp -d)"
echo "Using build directory: $BUILD_DIR"

# Copy all files to build directory
cp -r . "$BUILD_DIR/"

# Copy the TypeScript source for Docker build
echo "Preparing TypeScript source for Docker build..."

# Copy HttpBridge.ts to build directory (Docker will compile it)
mkdir -p "$BUILD_DIR/src/services/mcp"
cp "$SCRIPT_DIR/../../src/services/mcp/HttpBridge.ts" "$BUILD_DIR/src/services/mcp/"

# Build the Docker image
echo "Building Docker image..."
if command -v docker buildx &> /dev/null; then
    # Check if building for multiple platforms
    if [[ "$PLATFORM" == *","* ]]; then
        # For multi-platform, build for current architecture only when using --load
        echo "Note: Building for current architecture only (multi-platform with --load not supported)"
        docker buildx build \
            --tag "$IMAGE_NAME:$VERSION" \
            --tag "$IMAGE_NAME:latest" \
            --load \
            .
    else
        # Single platform build
        docker buildx build \
            --platform "$PLATFORM" \
            --tag "$IMAGE_NAME:$VERSION" \
            --tag "$IMAGE_NAME:latest" \
            --load \
            .
    fi
else
    # Fallback to regular docker build
    docker build \
        --tag "$IMAGE_NAME:$VERSION" \
        --tag "$IMAGE_NAME:latest" \
        .
fi

# Clean up build directory
cd "$SCRIPT_DIR"
rm -rf "$BUILD_DIR"

echo "✅ Docker image built successfully!"
echo "   Image: $IMAGE_NAME:$VERSION"
echo "   Size: $(docker images --format "table {{.Size}}" "$IMAGE_NAME:$VERSION" | tail -n 1)"

# Test the image
echo "Testing the image..."
CONTAINER_ID=$(docker run -d -p 8080:8080 \
    -e MCP_SERVER_CMD="echo" \
    -e MCP_SERVER_ARGS='{"jsonrpc":"2.0","result":{"capabilities":{}}}' \
    "$IMAGE_NAME:$VERSION")

sleep 3

if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
    docker logs "$CONTAINER_ID"
fi

# Clean up test container
docker stop "$CONTAINER_ID" > /dev/null
docker rm "$CONTAINER_ID" > /dev/null

echo "🚀 MCP HTTP Bridge image is ready to use!"
echo ""
echo "Usage examples:"
echo "  # Run Brave Search MCP server"
echo "  docker run -d -p 8080:8080 \\"
echo "    -e MCP_SERVER_CMD='npx' \\"
echo "    -e MCP_SERVER_ARGS='-y @modelcontextprotocol/server-brave-search' \\"
echo "    -e BRAVE_API_KEY='your-api-key' \\"
echo "    $IMAGE_NAME:$VERSION"
echo ""
echo "  # Test with curl"
echo "  curl http://localhost:8080/health"
echo "  curl http://localhost:8080/tools"