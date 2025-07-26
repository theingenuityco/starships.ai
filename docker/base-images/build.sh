#!/bin/bash

# Build script for MCP base images
# This script builds and tags the base images for MCP servers

set -e

# Configuration
REGISTRY="starships"
VERSION="latest"
PLATFORM="linux/amd64"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_status "Building MCP base images..."

# Build Node.js base image
print_status "Building Node.js base image..."
cd node
docker build --platform=$PLATFORM -t ${REGISTRY}/mcp-node:${VERSION} .
if [ $? -eq 0 ]; then
    print_success "Node.js base image built successfully"
else
    print_error "Failed to build Node.js base image"
    exit 1
fi
cd ..

# Build Python base image
print_status "Building Python base image..."
cd python
docker build --platform=$PLATFORM -t ${REGISTRY}/mcp-python:${VERSION} .
if [ $? -eq 0 ]; then
    print_success "Python base image built successfully"
else
    print_error "Failed to build Python base image"
    exit 1
fi
cd ..

# List built images
print_status "Built images:"
docker images | grep "${REGISTRY}/mcp-"

# Test images
print_status "Testing images..."

# Test Node.js image
print_status "Testing Node.js image..."
if docker run --rm ${REGISTRY}/mcp-node:${VERSION} node --version; then
    print_success "Node.js image test passed"
else
    print_error "Node.js image test failed"
fi

# Test Python image
print_status "Testing Python image..."
if docker run --rm ${REGISTRY}/mcp-python:${VERSION} python --version; then
    print_success "Python image test passed"
else
    print_error "Python image test failed"
fi

print_success "All base images built and tested successfully!"

# Optional: Push to registry
if [ "$1" = "--push" ]; then
    print_status "Pushing images to registry..."
    docker push ${REGISTRY}/mcp-node:${VERSION}
    docker push ${REGISTRY}/mcp-python:${VERSION}
    print_success "Images pushed to registry"
fi