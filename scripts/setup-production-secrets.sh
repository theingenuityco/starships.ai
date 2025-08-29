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

# All secrets should be provided as environment variables
# These will be automatically set by GitHub Actions from GitHub Secrets

# Check required environment variables
REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "ANTHROPIC_API_KEY"
    "STRIPE_SECRET_KEY"
    "STRIPE_PUBLISHABLE_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "NEO4J_PASSWORD"
    "KINDE_CLIENT_ID"
    "KINDE_CLIENT_SECRET"
    "KINDE_ISSUER_URL"
    "KINDE_SITE_URL"
    "KINDE_POST_LOGIN_REDIRECT_URL"
    "KINDE_POST_LOGOUT_REDIRECT_URL"
    "KINDE_REDIRECT_URL"
    "CLIENT_URL"
    "NEXT_PUBLIC_API_URL"
    "NEXT_PUBLIC_SERVER_URL"
    "GHCR_PULL_TOKEN"
)

MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "Error: The following required environment variables are not set:"
    for VAR in "${MISSING_VARS[@]}"; do
        echo "  - $VAR"
    done
    echo ""
    echo "These should be set by GitHub Actions from GitHub Secrets."
    echo "If running manually, export them before running this script."
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
    --from-literal=KINDE_SITE_URL="${KINDE_SITE_URL}" \
    --from-literal=KINDE_POST_LOGIN_REDIRECT_URL="${KINDE_POST_LOGIN_REDIRECT_URL}" \
    --from-literal=KINDE_POST_LOGOUT_REDIRECT_URL="${KINDE_POST_LOGOUT_REDIRECT_URL}" \
    --from-literal=KINDE_REDIRECT_URL="${KINDE_REDIRECT_URL}" \
    --from-literal=CLIENT_URL="${CLIENT_URL}" \
    --from-literal=NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}" \
    --from-literal=NEXT_PUBLIC_SERVER_URL="${NEXT_PUBLIC_SERVER_URL}" \
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
    --docker-username=dewangsolanki3 \
    --docker-password="${GHCR_PULL_TOKEN}" \
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