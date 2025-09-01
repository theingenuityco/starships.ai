#!/bin/bash

# Health Endpoint Verification Script
# Tests if health endpoints are accessible before deploying monitoring

echo "🔍 Verifying Health Endpoints..."
echo "================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Endpoints to test - should be provided as environment variables or arguments
PROD_URL="${PROD_URL:-${1}}"
DEV_URL="${DEV_URL:-${2}}"

# Check if URLs are provided
if [ -z "$PROD_URL" ] || [ -z "$DEV_URL" ]; then
    echo "❌ Error: URLs not provided"
    echo "Usage: $0 <prod_url> <dev_url>"
    echo "Or set PROD_URL and DEV_URL environment variables"
    echo ""
    echo "Example:"
    echo "  $0 https://starships.ai/health https://dev.starships.ai/health"
    echo "  PROD_URL=https://starships.ai/health DEV_URL=https://dev.starships.ai/health $0"
    exit 1
fi

# Function to check endpoint
check_endpoint() {
    local url=$1
    local name=$2
    
    echo -n "Checking $name ($url)... "
    
    # Make request with timeout
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
        
        # Try to get actual health data
        health_data=$(curl -s --max-time 5 "$url" 2>/dev/null)
        if [ ! -z "$health_data" ]; then
            # Check if it's JSON
            if echo "$health_data" | jq -e . >/dev/null 2>&1; then
                status=$(echo "$health_data" | jq -r '.status // "unknown"')
                echo "  Status: $status"
                
                # Check for required fields
                if echo "$health_data" | jq -e '.services' >/dev/null 2>&1; then
                    echo "  ✓ Has services field"
                fi
                if echo "$health_data" | jq -e '.timestamp' >/dev/null 2>&1; then
                    echo "  ✓ Has timestamp field"
                fi
            else
                echo -e "  ${YELLOW}⚠ Response is not JSON${NC}"
            fi
        fi
        return 0
    elif [ "$response" = "000" ]; then
        echo -e "${RED}✗ TIMEOUT${NC}"
        return 1
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        return 1
    fi
}

# Test endpoints
echo ""
prod_result=0
dev_result=0

check_endpoint "$PROD_URL" "Production" || prod_result=1
echo ""
check_endpoint "$DEV_URL" "Development" || dev_result=1

# Summary
echo ""
echo "================================"
echo "Summary:"

if [ $prod_result -eq 0 ] && [ $dev_result -eq 0 ]; then
    echo -e "${GREEN}✓ All endpoints are healthy${NC}"
    echo "Ready for monitoring deployment!"
    exit 0
elif [ $prod_result -eq 0 ] || [ $dev_result -eq 0 ]; then
    echo -e "${YELLOW}⚠ Some endpoints are not accessible${NC}"
    echo "Monitoring will work but may report false positives"
    exit 1
else
    echo -e "${RED}✗ No endpoints are accessible${NC}"
    echo "Please verify the URLs and health endpoint implementation"
    exit 2
fi