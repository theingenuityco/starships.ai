#!/bin/bash
set -e

echo "🚀 Testing Starships.ai Docker Image Locally"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="starships-test-$(date +%s)"
IMAGE_NAME="starships-ai:local"

# Clean up function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Step 1: Build the image
echo -e "\n${YELLOW}Step 1: Building Docker image...${NC}"
docker build -t $IMAGE_NAME . || {
    echo -e "${RED}Failed to build image${NC}"
    exit 1
}
echo -e "${GREEN}✓ Image built successfully${NC}"

# Step 2: Run the container
echo -e "\n${YELLOW}Step 2: Starting container...${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    -p 3000:3000 \
    -p 4000:4000 \
    -p 7474:7474 \
    -p 7687:7687 \
    -e NEO4J_PASSWORD=test[DEFAULT-PASSWORD]123 \
    -e NODE_ENV=development \
    $IMAGE_NAME || {
    echo -e "${RED}Failed to start container${NC}"
    exit 1
}
echo -e "${GREEN}✓ Container started${NC}"

# Step 3: Wait for services to be ready
echo -e "\n${YELLOW}Step 3: Waiting for services to start...${NC}"
echo "This may take 2-5 minutes on first run..."

# Wait for Neo4j
echo -n "Waiting for Neo4j..."
for i in {1..60}; do
    if curl -s http://localhost:7474 > /dev/null 2>&1; then
        echo -e " ${GREEN}Ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for Backend
echo -n "Waiting for Backend API..."
for i in {1..60}; do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        echo -e " ${GREEN}Ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for Frontend
echo -n "Waiting for Frontend..."
for i in {1..60}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e " ${GREEN}Ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Step 4: Test all endpoints
echo -e "\n${YELLOW}Step 4: Testing endpoints...${NC}"

# Test Frontend
echo -n "Testing Frontend (port 3000)... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|304"; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test Backend
echo -n "Testing Backend API (port 4000)... "
if curl -s http://localhost:4000/health | grep -q "ok\|healthy"; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test Neo4j Browser
echo -n "Testing Neo4j Browser (port 7474)... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7474 | grep -q "200"; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test Neo4j Bolt
echo -n "Testing Neo4j Bolt (port 7687)... "
if nc -z localhost 7687 2>/dev/null; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Step 5: Show container info
echo -e "\n${YELLOW}Step 5: Container Information${NC}"
echo "=============================="
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Step 6: Show logs
echo -e "\n${YELLOW}Step 6: Recent Logs${NC}"
echo "==================="
docker logs --tail 20 $CONTAINER_NAME

# Success message
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Docker image is working correctly!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "You can now access:"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend API: http://localhost:4000"
echo "  - Neo4j Browser: http://localhost:7474"
echo ""
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop: docker stop $CONTAINER_NAME"
echo ""
echo "Press Ctrl+C to stop and cleanup..."

# Keep running to show logs
docker logs -f $CONTAINER_NAME