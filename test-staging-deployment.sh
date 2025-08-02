#!/bin/bash

# Test script for HTTP bridge staging deployment
echo "🚀 Testing HTTP Bridge Staging Deployment"
echo "=========================================="

# Color codes for output
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
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Starting staging environment..."

# Build HTTP bridge image if it doesn't exist
if ! docker images | grep -q "starships/mcp-http-bridge"; then
    print_status "Building HTTP bridge Docker image..."
    cd packages/core/docker/mcp-http-bridge
    chmod +x build.sh
    ./build.sh
    cd ../../../..
    
    if ! docker images | grep -q "starships/mcp-http-bridge"; then
        print_error "Failed to build HTTP bridge image"
        exit 1
    fi
    print_success "HTTP bridge image built successfully"
else
    print_success "HTTP bridge image already exists"
fi

# Start staging environment
print_status "Starting staging Docker Compose environment..."
docker compose -f docker-compose.staging.yml up -d

# Wait for services to be healthy
print_status "Waiting for services to start..."
sleep 10

# Check Neo4j health
print_status "Checking Neo4j staging health..."
for i in {1..30}; do
    if curl -s http://localhost:7475 > /dev/null; then
        print_success "Neo4j staging is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Neo4j staging failed to start"
        exit 1
    fi
    sleep 2
done

# Check Starships server health
print_status "Checking Starships server staging health..."
for i in {1..30}; do
    if curl -s http://localhost:4001/health > /dev/null; then
        print_success "Starships server staging is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Starships server staging failed to start"
        exit 1
    fi
    sleep 2
done

# Check HTTP Bridge MCP server health
print_status "Checking HTTP Bridge MCP server health..."
for i in {1..30}; do
    if curl -s http://localhost:8081/health > /dev/null; then
        print_success "HTTP Bridge MCP server is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        print_warning "HTTP Bridge MCP server is not responding (may need valid API key)"
        break
    fi
    sleep 2
done

# Test HTTP Bridge endpoints
print_status "Testing HTTP Bridge endpoints..."

# Test health endpoint
print_status "Testing /health endpoint..."
if curl -s -f http://localhost:8081/health > /dev/null; then
    print_success "Health endpoint responding"
    curl -s http://localhost:8081/health | jq . || echo "Health response received"
else
    print_warning "Health endpoint not responding (may require valid API key)"
fi

# Test tools endpoint
print_status "Testing /tools endpoint..."
if curl -s -f http://localhost:8081/tools > /dev/null; then
    print_success "Tools endpoint responding"
    curl -s http://localhost:8081/tools | jq . || echo "Tools response received"
else
    print_warning "Tools endpoint not responding (may require valid API key)"
fi

# Test feature flag API
print_status "Testing feature flag API..."
if curl -s -f http://localhost:4001/api/starships/feature-flags > /dev/null; then
    print_success "Feature flag API responding"
    curl -s http://localhost:4001/api/starships/feature-flags | jq . || echo "Feature flag response received"
else
    print_warning "Feature flag API not responding (may require authentication)"
fi

# Check container status
print_status "Container status:"
docker compose -f docker-compose.staging.yml ps

print_success "Staging deployment test completed!"
print_status "Services running:"
print_status "  - Neo4j staging: http://localhost:7475"
print_status "  - Starships server: http://localhost:4001"
print_status "  - HTTP Bridge MCP: http://localhost:8081"
print_status ""
print_status "To stop the staging environment:"
print_status "  docker compose -f docker-compose.staging.yml down"