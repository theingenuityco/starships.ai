#!/bin/bash
# Production Rollback Script

NAMESPACE="starships-prod"
DEPLOYMENT="starships-app"

echo "========================================="
echo "Production Rollback Script"
echo "========================================="

# Check current deployment status
echo "Current deployment status:"
kubectl get deployment $DEPLOYMENT -n $NAMESPACE

# Show rollout history
echo ""
echo "Rollout history:"
kubectl rollout history deployment/$DEPLOYMENT -n $NAMESPACE

# Ask for confirmation
echo ""
read -p "Do you want to rollback to the previous version? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled"
    exit 0
fi

# Perform rollback
echo ""
echo "Rolling back deployment..."
kubectl rollout undo deployment/$DEPLOYMENT -n $NAMESPACE

# Wait for rollback to complete
echo "Waiting for rollback to complete..."
kubectl rollout status deployment/$DEPLOYMENT -n $NAMESPACE --timeout=300s

# Show new status
echo ""
echo "Rollback completed. New deployment status:"
kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o wide
kubectl get pods -n $NAMESPACE -l app=starships-ai

echo ""
echo "========================================="
echo "Rollback completed successfully"
echo "Please verify the application is working correctly"
echo "========================================="