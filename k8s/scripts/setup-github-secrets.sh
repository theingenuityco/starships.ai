#!/bin/bash
# Script to help set up GitHub secrets for EKS deployment

set -e

echo "GitHub Secrets Setup for Starships.AI EKS Deployment"
echo "===================================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Please install it first:"
    echo "   brew install gh (macOS)"
    echo "   https://cli.github.com/manual/installation"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub. Please run:"
    echo "   gh auth login"
    exit 1
fi

# Get repository
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "📦 Repository: $REPO"
echo ""

# Function to set secret
set_secret() {
    local name=$1
    local prompt=$2
    local value=$3
    
    if [ -z "$value" ]; then
        read -p "$prompt: " -s value
        echo ""
    fi
    
    if [ ! -z "$value" ]; then
        echo "$value" | gh secret set "$name" --repo "$REPO"
        echo "✅ Set $name"
    else
        echo "⏭️  Skipped $name"
    fi
}

echo "Setting up AWS Configuration Secrets..."
echo "----------------------------------------"

# AWS Role ARN
echo "To get your AWS Role ARN, run:"
echo "  aws iam get-role --role-name github-actions-eks-role --query 'Role.Arn' --output text"
echo ""
read -p "Enter AWS_ROLE_TO_ASSUME: " AWS_ROLE_ARN
set_secret "AWS_ROLE_TO_ASSUME" "" "$AWS_ROLE_ARN"

# Domain name
read -p "Enter your domain name (e.g., starships.example.com): " DOMAIN
set_secret "DOMAIN_NAME" "" "$DOMAIN"

# ACM Certificate ARN
echo ""
echo "To get your ACM Certificate ARN, run:"
echo "  aws acm list-certificates --region us-west-2"
echo ""
read -p "Enter ACM_CERTIFICATE_ARN: " ACM_ARN
set_secret "ACM_CERTIFICATE_ARN" "" "$ACM_ARN"

echo ""
echo "Setting up Application Secrets..."
echo "---------------------------------"

# Neo4j Password
set_secret "NEO4J_PASSWORD" "Enter Neo4j [DEFAULT-PASSWORD]"

# API Keys
set_secret "OPENAI_API_KEY" "Enter OpenAI API key"
set_secret "ANTHROPIC_API_KEY" "Enter Anthropic API key"

# Stripe Configuration
echo ""
echo "Setting up Stripe Configuration..."
set_secret "STRIPE_SECRET_KEY" "Enter Stripe secret key"
set_secret "STRIPE_WEBHOOK_SECRET" "Enter Stripe webhook secret"
set_secret "STRIPE_PORTAL_ENDPOINT" "Enter Stripe portal endpoint"

# Optional Slack webhook
echo ""
read -p "Do you want to set up Slack notifications? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    set_secret "SLACK_WEBHOOK_URL" "Enter Slack webhook URL"
fi

echo ""
echo "🎉 GitHub Secrets setup complete!"
echo ""
echo "Current secrets:"
gh secret list --repo "$REPO"

echo ""
echo "Next steps:"
echo "1. Verify all secrets are set correctly"
echo "2. Run the deployment workflow:"
echo "   gh workflow run deploy-to-eks.yml"
echo "3. Monitor the deployment:"
echo "   gh run watch"