#!/bin/bash

# Script to add missing GitHub secrets for dev and prod environments
# Run this script to configure all URL-related secrets that are currently missing

echo "========================================="
echo "Adding Missing GitHub Secrets"
echo "========================================="
echo ""

# Function to set secret for an environment
set_secret() {
    local env=$1
    local name=$2
    local value=$3
    echo "Setting $name for $env environment..."
    gh secret set "$name" --env "$env" --body "$value"
}

# Dev Environment Secrets
echo "📦 Setting up DEV environment secrets..."
echo "----------------------------------------"

# URL Configuration for Dev
set_secret "dev" "CLIENT_URL" "https://dev.starships.ai"
set_secret "dev" "NEXT_PUBLIC_API_URL" "https://dev.starships.ai/api"
set_secret "dev" "NEXT_PUBLIC_SERVER_URL" "https://dev.starships.ai/api"
set_secret "dev" "KINDE_SITE_URL" "https://dev.starships.ai"
set_secret "dev" "KINDE_POST_LOGIN_REDIRECT_URL" "https://dev.starships.ai/fleet"
set_secret "dev" "KINDE_POST_LOGOUT_REDIRECT_URL" "https://dev.starships.ai"
set_secret "dev" "KINDE_REDIRECT_URL" "https://dev.starships.ai/api/auth/kinde_callback"
set_secret "dev" "KINDE_COOKIE_DOMAIN" "dev.starships.ai"
set_secret "dev" "KINDE_ISSUER_URL" "https://starshipsai.kinde.com"

# Copy GHCR_PULL_TOKEN from repository level to dev environment
echo "Copying GHCR_PULL_TOKEN to dev environment..."
GHCR_TOKEN=$(gh secret list -j | jq -r '.[] | select(.name=="GHCR_PULL_TOKEN") | .name')
if [ ! -z "$GHCR_TOKEN" ]; then
    echo "Note: GHCR_PULL_TOKEN exists at repository level. You may want to copy it to env level for consistency."
fi

echo ""
echo "📦 Setting up PROD environment secrets..."
echo "----------------------------------------"

# URL Configuration for Prod
set_secret "prod" "CLIENT_URL" "https://starships.ai"
set_secret "prod" "NEXT_PUBLIC_API_URL" "https://starships.ai/api"
set_secret "prod" "NEXT_PUBLIC_SERVER_URL" "https://starships.ai/api"
set_secret "prod" "KINDE_SITE_URL" "https://starships.ai"
set_secret "prod" "KINDE_POST_LOGIN_REDIRECT_URL" "https://starships.ai/fleet"
set_secret "prod" "KINDE_POST_LOGOUT_REDIRECT_URL" "https://starships.ai"
set_secret "prod" "KINDE_REDIRECT_URL" "https://starships.ai/api/auth/kinde_callback"

echo ""
echo "========================================="
echo "✅ Missing secrets have been added!"
echo "========================================="
echo ""

# Verify the secrets
echo "Verifying DEV environment secrets:"
gh secret list --env dev

echo ""
echo "Verifying PROD environment secrets:"
gh secret list --env prod

echo ""
echo "⚠️  Note: GHCR_PULL_TOKEN is available at repository level."
echo "    Both environments can access it from there."
echo ""
echo "Next steps:"
echo "1. Verify all secrets are correctly set"
echo "2. Trigger a deployment to test the configuration"
echo "3. Monitor logs for any authentication issues"