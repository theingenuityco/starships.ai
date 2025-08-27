#!/bin/bash
# Script to setup production secrets in Kubernetes
# Run this after configuring GitHub secrets

echo "========================================="
echo "Production Secrets Setup"
echo "========================================="

# Switch to production context
kubectl config use-context do-nyc1-starships-prod

# Check if we're in the right context
CURRENT_CONTEXT=$(kubectl config current-context)
if [[ "$CURRENT_CONTEXT" != *"prod"* ]]; then
    echo "Error: Not in production context. Current: $CURRENT_CONTEXT"
    exit 1
fi

echo "Current context: $CURRENT_CONTEXT"
echo ""

# Kinde OAuth credentials (from your production app)
KINDE_CLIENT_ID="[KINDE-PROD-CLIENT-ID]"
KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET:-[API-KEY]}"
KINDE_ISSUER_URL="[KINDE-ISSUER-URL]"

# Neo4j [DEFAULT-PASSWORD] (generated earlier)
NEO4J_PASSWORD="[NEO4J-PASSWORD]"

# You need to set these environment variables or replace them
echo "Please ensure you have set the following environment variables:"
echo "- OPENAI_API_KEY"
echo "- ANTHROPIC_API_KEY"
echo "- STRIPE_SECRET_KEY"
echo "- STRIPE_PUBLISHABLE_KEY"
echo "- STRIPE_WEBHOOK_SECRET"
echo "- KINDE_CLIENT_SECRET"
echo "- GITHUB_USERNAME (your GitHub username)"
echo "- GITHUB_PAT (GitHub Personal Access Token with packages:read)"
echo ""

read -p "Have you set all required environment variables? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Please set the required environment variables and run this script again."
    echo ""
    echo "Example:"
    echo "export OPENAI_API_KEY='[OPENAI-API-KEY]'"
    echo "export ANTHROPIC_API_KEY='[ANTHROPIC-API-KEY]'"
    echo "export STRIPE_SECRET_KEY='[STRIPE-SECRET-KEY]'"
    echo "export STRIPE_PUBLISHABLE_KEY='[STRIPE-PUBLISHABLE-KEY]'"
    echo "export STRIPE_WEBHOOK_SECRET='[STRIPE-WEBHOOK-SECRET]'"
    echo "export KINDE_CLIENT_SECRET='[API-KEY]'"
    echo "export GITHUB_USERNAME='dsolanski'"
    echo "export GITHUB_PAT='[GITHUB-PAT]'"
    exit 1
fi

# Delete existing secrets if they exist
echo "Cleaning up existing secrets..."
kubectl delete secret starships-secrets -n starships-prod --ignore-not-found=true
kubectl delete secret kinde-auth-secret -n starships-prod --ignore-not-found=true
kubectl delete secret ghcr-pull-secret -n starships-prod --ignore-not-found=true

# Create API secrets
echo "Creating API secrets..."
kubectl create secret generic starships-secrets \
    --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY}" \
    --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
    --from-literal=STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY}" \
    --from-literal=STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET}" \
    --from-literal=STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY}" \
    --from-literal=NEO4J_PASSWORD="${NEO4J_PASSWORD}" \
    -n starships-prod

# Create Kinde secrets
echo "Creating Kinde authentication secrets..."
kubectl create secret generic kinde-auth-secret \
    --from-literal=KINDE_CLIENT_ID="${KINDE_CLIENT_ID}" \
    --from-literal=KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET}" \
    --from-literal=KINDE_ISSUER_URL="${KINDE_ISSUER_URL}" \
    -n starships-prod

# Create GHCR pull secret
echo "Creating GitHub Container Registry pull secret..."
kubectl create secret docker-registry ghcr-pull-secret \
    --docker-server=ghcr.io \
    --docker-username="${GITHUB_USERNAME}" \
    --docker-[DEFAULT-PASSWORD]="${GITHUB_PAT}" \
    -n starships-prod

echo ""
echo "========================================="
echo "Secrets created successfully!"
echo "========================================="

# Verify secrets were created
echo ""
echo "Verifying secrets:"
kubectl get secrets -n starships-prod

echo ""
echo "Next steps:"
echo "1. Deploy the application using: kubectl apply -f k8s/prod/"
echo "2. Or trigger a GitHub release to deploy automatically"
echo ""