#!/bin/bash

echo "Rebuilding Starships.ai with proper Kinde configuration..."

# Export Kinde variables for build
export KINDE_CLIENT_ID="64a7c9db757e4a91ac54d003b6e869ef"
export KINDE_CLIENT_SECRET="UmmaePjv0Grt4OrYNHNAheA51NMyv3FPJ4Erh3VnfCaaGbhldWsjS"
export KINDE_ISSUER_URL="https://starshipsai.kinde.com"
export KINDE_SITE_URL="http://starships.ai"
export KINDE_POST_LOGIN_REDIRECT_URL="http://starships.ai/fleet"
export KINDE_POST_LOGOUT_REDIRECT_URL="http://starships.ai"

# Build the Docker image with build args
docker build \
  --build-arg KINDE_CLIENT_ID="${KINDE_CLIENT_ID}" \
  --build-arg KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET}" \
  --build-arg KINDE_ISSUER_URL="${KINDE_ISSUER_URL}" \
  --build-arg KINDE_SITE_URL="${KINDE_SITE_URL}" \
  --build-arg KINDE_POST_LOGIN_REDIRECT_URL="${KINDE_POST_LOGIN_REDIRECT_URL}" \
  --build-arg KINDE_POST_LOGOUT_REDIRECT_URL="${KINDE_POST_LOGOUT_REDIRECT_URL}" \
  -t ghcr.io/theingenuityco/starships.ai:kinde-fix \
  -f Dockerfile .

echo "Pushing image to registry..."
docker push ghcr.io/theingenuityco/starships.ai:kinde-fix

echo "Updating Kubernetes deployment..."
kubectl set image deployment/starships-all \
  starships=ghcr.io/theingenuityco/starships.ai:kinde-fix \
  -n starships-prod

echo "Waiting for rollout..."
kubectl rollout status deployment/starships-all -n starships-prod

echo "Deployment complete!"