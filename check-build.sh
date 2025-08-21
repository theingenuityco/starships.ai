#!/bin/bash

echo "Monitoring Docker image rebuild status..."
echo "Current time: $(date)"
echo "----------------------------------------"

# Current image SHA
CURRENT_SHA="sha256:bcf5467f5d8fe3368b7327e663c5895ed6df318cb1cf58270be043203303b97a"

# Check pod status
echo "Current pod status:"
kubectl get pods -n starships-prod | grep starships-app

echo ""
echo "Current image SHA: $CURRENT_SHA"
echo ""
echo "Waiting for new image to be built and deployed..."
echo "This typically takes 5-10 minutes after PR merge."
echo ""
echo "You can check the build status at:"
echo "https://github.com/theingenuityco/starships.ai/actions"
echo ""
echo "Once the build completes, run:"
echo "kubectl rollout restart deployment/starships-app -n starships-prod"
echo ""
echo "Then check logs with:"
echo "kubectl logs -f deployment/starships-app -n starships-prod"