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
KINDE_CLIENT_ID="95be67f727634e25aa2e29311c5162c8"
KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET:-1OXzXWTEwLhQXZlSo9CtsevZwGR1nd0XCLWA5NBD1mT0CClMpTfq}"
KINDE_ISSUER_URL="https://starshipsai.kinde.com"

# Neo4j password (generated earlier)
NEO4J_PASSWORD="pHc+7xT+qltp6hY1JBGGW/n3Tf1iwalqCEo4ZGf5M5c="

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
    echo "export OPENAI_API_KEY='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'"
    echo "export ANTHROPIC_API_KEY='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'"
    echo "export STRIPE_SECRET_KEY='sk_test_51Rt5WzBjIjJoPxobIRPi2lJf4spU9D167mXMpybh8vDjJmVEEA9l9gdIa4FWcXTw6eNhlfyFJr2UgACzOMCKP7s900QFRoHOEi'"
    echo "export STRIPE_PUBLISHABLE_KEY='pk_test_51Rt5WzBjIjJoPxobe0C5hSs65CDrxt507E3OPVG8NCfiKiFbHwHqfXjg23kGyX77HowmhwPoHAv3abSbAfcWRYtg00lh7eFhVG'"
    echo "export STRIPE_WEBHOOK_SECRET='whsec_7b55abd64990e9d6152812fd21054c3655bf213abbaa3ec04e6ca1fa9c8bc6c5'"
    echo "export KINDE_CLIENT_SECRET='1OXzXWTEwLhQXZlSo9CtsevZwGR1nd0XCLWA5NBD1mT0CClMpTfq'"
    echo "export GITHUB_USERNAME='dsolanski'"
    echo "export GITHUB_PAT='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'"
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
    --docker-password="${GITHUB_PAT}" \
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