#!/bin/bash

# Script to add users to the Starships.ai waitlist in production
# Usage: ./add-waitlist-user.sh <email> [notes]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="starships-dev"  # Change to starships-prod for production
CONTEXT="do-nyc1-starships-dev"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if email is provided
if [ -z "$1" ]; then
    print_error "Email address is required!"
    echo "Usage: $0 <email> [notes]"
    echo "Example: $0 user@example.com 'VIP access'"
    exit 1
fi

EMAIL="$1"
NOTES="${2:-Added via script}"
ADDED_BY="${USER:-admin}"

# Validate email format
if ! [[ "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    print_error "Invalid email format: $EMAIL"
    exit 1
fi

print_info "Adding user to waitlist..."
print_info "Email: $EMAIL"
print_info "Notes: $NOTES"
print_info "Added by: $ADDED_BY"
print_info "Namespace: $NAMESPACE"

# Check current context
CURRENT_CONTEXT=$(kubectl config current-context)
if [ "$CURRENT_CONTEXT" != "$CONTEXT" ]; then
    print_warning "Current context is $CURRENT_CONTEXT, switching to $CONTEXT"
    kubectl config use-context "$CONTEXT"
fi

# Get the pod name
POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app=starships-app -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POD_NAME" ]; then
    print_error "No Starships pod found in namespace $NAMESPACE"
    exit 1
fi

print_info "Found pod: $POD_NAME"

# Create the Cypher query
CYPHER_QUERY="CREATE (w:WaitlistEntry {email: '${EMAIL}', isApproved: true, createdAt: datetime(), addedBy: '${ADDED_BY}', notes: '${NOTES}'}) RETURN w.email as email, w.isApproved as approved"

# Execute the query
print_info "Adding user to waitlist database..."

kubectl exec -n "$NAMESPACE" "$POD_NAME" -- bash -c "
cd /app && \
cat > /tmp/add-user.cypher << 'EOF'
${CYPHER_QUERY}
EOF

# Use cypher-shell to execute the query
/app/neo4j/bin/cypher-shell -u neo4j -p password --format plain < /tmp/add-user.cypher
"

if [ $? -eq 0 ]; then
    print_info "✅ Successfully added $EMAIL to the waitlist!"
    echo ""
    echo "The user can now:"
    echo "1. Go to https://dev.starships.ai/waitlist"
    echo "2. Enter their email: $EMAIL"
    echo "3. They will be validated and redirected to the app"
else
    print_error "Failed to add user to waitlist"
    exit 1
fi

# Optional: List all approved users
read -p "Do you want to see all approved users? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Fetching all approved users..."
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- bash -c "
    echo 'MATCH (w:WaitlistEntry {isApproved: true}) RETURN w.email as Email, w.addedBy as AddedBy, w.notes as Notes ORDER BY w.createdAt DESC;' | \
    /app/neo4j/bin/cypher-shell -u neo4j -p password --format table
    "
fi