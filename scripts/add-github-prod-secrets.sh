#!/bin/bash
# Script to add missing secrets to GitHub prod environment

echo "========================================="
echo "Adding Missing Secrets to GitHub Prod Environment"
echo "========================================="

# These are the values from your setup script
OPENAI_API_KEY='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'
NEO4J_PASSWORD='pHc+7xT+qltp6hY1JBGGW/n3Tf1iwalqCEo4ZGf5M5c='
NEO4J_USERNAME='neo4j'
NEO4J_URI='bolt://localhost:7687'
NEO4J_DATABASE='neo4j'
STRIPE_SECRET_KEY='sk_test_51Rt5WzBjIjJoPxobIRPi2lJf4spU9D167mXMpybh8vDjJmVEEA9l9gdIa4FWcXTw6eNhlfyFJr2UgACzOMCKP7s900QFRoHOEi'
STRIPE_PUBLISHABLE_KEY='pk_test_51Rt5WzBjIjJoPxobe0C5hSs65CDrxt507E3OPVG8NCfiKiFbHwHqfXjg23kGyX77HowmhwPoHAv3abSbAfcWRYtg00lh7eFhVG'
STRIPE_WEBHOOK_SECRET='whsec_7b55abd64990e9d6152812fd21054c3655bf213abbaa3ec04e6ca1fa9c8bc6c5'
KINDE_ISSUER_URL='https://starshipsai.kinde.com'

echo "Adding missing secrets to prod environment..."
echo ""

# Add OPENAI_API_KEY
echo "Adding OPENAI_API_KEY..."
echo "$OPENAI_API_KEY" | gh secret set OPENAI_API_KEY --env prod

# Add NEO4J secrets
echo "Adding NEO4J_PASSWORD..."
echo "$NEO4J_PASSWORD" | gh secret set NEO4J_PASSWORD --env prod

echo "Adding NEO4J_USERNAME..."
echo "$NEO4J_USERNAME" | gh secret set NEO4J_USERNAME --env prod

echo "Adding NEO4J_URI..."
echo "$NEO4J_URI" | gh secret set NEO4J_URI --env prod

echo "Adding NEO4J_DATABASE..."
echo "$NEO4J_DATABASE" | gh secret set NEO4J_DATABASE --env prod

# Add STRIPE secrets (using test keys for now)
echo "Adding STRIPE_SECRET_KEY (TEST)..."
echo "$STRIPE_SECRET_KEY" | gh secret set STRIPE_SECRET_KEY --env prod

echo "Adding STRIPE_PUBLISHABLE_KEY (TEST)..."
echo "$STRIPE_PUBLISHABLE_KEY" | gh secret set STRIPE_PUBLISHABLE_KEY --env prod

echo "Adding STRIPE_WEBHOOK_SECRET..."
echo "$STRIPE_WEBHOOK_SECRET" | gh secret set STRIPE_WEBHOOK_SECRET --env prod

# Add KINDE_ISSUER_URL
echo "Adding KINDE_ISSUER_URL..."
echo "$KINDE_ISSUER_URL" | gh secret set KINDE_ISSUER_URL --env prod

echo ""
echo "========================================="
echo "✅ All secrets added to GitHub prod environment!"
echo "========================================="
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "1. Stripe keys are TEST keys. Update with LIVE keys for real production."
echo "2. To update with live Stripe keys later, run:"
echo "   echo 'sk_live_YOUR_KEY' | gh secret set STRIPE_SECRET_KEY --env prod"
echo "   echo 'pk_live_YOUR_KEY' | gh secret set STRIPE_PUBLISHABLE_KEY --env prod"
echo ""
echo "Verifying all prod secrets:"
gh secret list --env prod