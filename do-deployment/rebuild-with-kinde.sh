#!/bin/bash

echo "Rebuilding Starships.ai with proper Kinde configuration..."

# Export Kinde variables for build
export KINDE_CLIENT_ID="[KINDE-CLIENT-ID]"
export KINDE_CLIENT_SECRET="[API-KEY]"
export KINDE_ISSUER_URL="[KINDE-ISSUER-URL]"
export KINDE_SITE_URL="[INSECURE-PROD-URL]"
export KINDE_POST_LOGIN_REDIRECT_URL="[INSECURE-PROD-URL]/fleet"
export KINDE_POST_LOGOUT_REDIRECT_URL="[INSECURE-PROD-URL]"

# Build the Docker image with build args
docker build \
  --build-arg KINDE_CLIENT_ID="${KINDE_CLIENT_ID}" \
  --build-arg KINDE_CLIENT_SECRET="${KINDE_CLIENT_SECRET}" \
  --build-arg KINDE_ISSUER_URL="${KINDE_ISSUER_URL}" \
  --build-arg KINDE_SITE_URL="${KINDE_SITE_URL}" \
  --build-arg KINDE_POST_LOGIN_REDIRECT_URL="${KINDE_POST_LOGIN_REDIRECT_URL}" \
  --build-arg KINDE_POST_LOGOUT_REDIRECT_URL="${KINDE_POST_LOGOUT_REDIRECT_URL}" \
  -t [DOCKER-REGISTRY-URL]:kinde-fix \
  -f Dockerfile .

echo "Pushing image to registry..."
docker push [DOCKER-REGISTRY-URL]:kinde-fix

echo "Updating Kubernetes deployment..."
kubectl set image deployment/starships-all \
  starships=[DOCKER-REGISTRY-URL]:kinde-fix \
  -n starships-prod

echo "Waiting for rollout..."
kubectl rollout status deployment/starships-all -n starships-prod

echo "Deployment complete!"