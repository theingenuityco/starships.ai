# DevOps Strategy for Starships.AI

## Overview
This document outlines the complete DevOps strategy for deploying Starships.AI to AWS EKS with automated CI/CD through GitHub Actions.

## Architecture

```
GitHub → GitHub Actions → GHCR → AWS EKS
```

### Components:
1. **Source Control**: GitHub
2. **CI/CD**: GitHub Actions
3. **Container Registry**: GitHub Container Registry (GHCR)
4. **Orchestration**: AWS EKS (Kubernetes)
5. **Load Balancer**: AWS Application Load Balancer (ALB)
6. **Storage**: AWS EBS (gp3)
7. **Database**: Neo4j (embedded or external)

## CI/CD Pipeline

### 1. Build & Publish (On every merge to main)
**Workflow**: `.github/workflows/publish-image.yml`
- Triggers on push to main branch
- Builds multi-stage Docker image with all applications
- Includes Neo4j in the container (configurable internal/external)
- Pushes to GHCR with tags: `latest`, `sha-<commit>`, `<date>`

### 2. Deploy to EKS (Automatic after build)
**Workflow**: `.github/workflows/deploy-to-eks.yml`
- Triggers after successful image publish
- Authenticates with AWS using OIDC
- Updates Kubernetes manifests with new image
- Performs rolling deployment
- Runs smoke tests
- Sends Slack notifications

## AWS EKS Setup

### Prerequisites

1. **Create EKS Cluster**:
```bash
eksctl create cluster \
  --name starships-cluster \
  --region us-west-2 \
  --nodegroup-name starships-nodes \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5 \
  --managed
```

2. **Install AWS Load Balancer Controller**:
```bash
# Install cert-manager
kubectl apply --validate=false -f https://github.com/jetstack/cert-manager/releases/download/v1.5.4/cert-manager.yaml

# Install AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=starships-cluster
```

3. **Install EBS CSI Driver**:
```bash
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster starships-cluster \
  --region us-west-2
```

### GitHub Actions OIDC Setup

1. **Create OIDC Provider**:
```bash
eksctl utils associate-iam-oidc-provider \
  --cluster starships-cluster \
  --region us-west-2 \
  --approve
```

2. **Create IAM Role for GitHub Actions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:theingenuityco/starships.ai:*"
        },
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

3. **Attach EKS Permissions**:
```bash
aws iam attach-role-policy \
  --role-name github-actions-eks-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

aws iam attach-role-policy \
  --role-name github-actions-eks-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy
```

## GitHub Secrets Configuration

Add these secrets to your GitHub repository:

### AWS Configuration
- `AWS_ROLE_TO_ASSUME`: ARN of the IAM role for GitHub Actions
- `DOMAIN_NAME`: Your domain (e.g., starships.example.com)
- `ACM_CERTIFICATE_ARN`: ARN of your ACM certificate

### Application Secrets
- `NEO4J_PASSWORD`: Neo4j database password
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook secret
- `STRIPE_PORTAL_ENDPOINT`: Stripe portal endpoint

### Optional
- `SLACK_WEBHOOK_URL`: For deployment notifications

## Deployment Process

### Automatic Deployment (Recommended)

Every merge to main automatically:
1. Builds and pushes Docker image to GHCR
2. Deploys to EKS cluster
3. Updates all services with zero downtime
4. Runs health checks
5. Notifies team via Slack

### Manual Deployment

```bash
# Trigger deployment workflow manually
gh workflow run deploy-to-eks.yml -f environment=production
```

### Local Testing

```bash
# Test Docker image locally
docker run -p 3000:3000 -p 8080:8080 \
  -e NEO4J_EXTERNAL_URI=neo4j+s://your-aura-instance \
  -e NEO4J_PASSWORD=your-password \
  ghcr.io/theingenuityco/starships.ai:latest

# Test Kubernetes manifests locally with minikube
minikube start
kubectl apply -f k8s/base/
```

## Monitoring & Operations

### View Logs
```bash
# All pods
kubectl logs -f -l app=starships-ai -n starships-ai

# Specific container
kubectl logs -f deployment/starships-app -c main -n starships-ai
```

### Scale Application
```bash
# Manual scaling
kubectl scale deployment/starships-app --replicas=5 -n starships-ai

# HPA auto-scales between 2-10 replicas based on CPU/memory
```

### Update Configuration
```bash
# Edit ConfigMap
kubectl edit configmap starships-config -n starships-ai

# Restart pods to pick up changes
kubectl rollout restart deployment/starships-app -n starships-ai
```

### Troubleshooting
```bash
# Check pod status
kubectl get pods -n starships-ai
kubectl describe pod <pod-name> -n starships-ai

# Check events
kubectl get events -n starships-ai --sort-by='.lastTimestamp'

# Execute commands in pod
kubectl exec -it <pod-name> -n starships-ai -- /bin/sh
```

## Rollback Strategy

### Automatic Rollback
The deployment includes health checks that automatically rollback on failure.

### Manual Rollback
```bash
# View rollout history
kubectl rollout history deployment/starships-app -n starships-ai

# Rollback to previous version
kubectl rollout undo deployment/starships-app -n starships-ai

# Rollback to specific revision
kubectl rollout undo deployment/starships-app --to-revision=2 -n starships-ai
```

## Cost Optimization

1. **Node Autoscaling**: EKS cluster scales nodes 2-5 based on load
2. **Pod Autoscaling**: HPA scales pods 2-10 based on CPU/memory
3. **Spot Instances**: Consider using Spot instances for non-critical workloads
4. **Resource Limits**: Pods have defined resource limits to prevent overconsumption

## Security

1. **RBAC**: Kubernetes RBAC limits pod permissions
2. **Secrets Management**: All sensitive data in Kubernetes secrets
3. **Network Policies**: Restrict inter-pod communication
4. **Image Scanning**: GHCR scans images for vulnerabilities
5. **OIDC Authentication**: GitHub Actions uses OIDC, not long-lived credentials

## Disaster Recovery

1. **Persistent Volumes**: Data persisted to EBS volumes
2. **Backup Strategy**: 
   - Neo4j data backed up to S3 daily
   - Application state in persistent volumes
3. **Multi-AZ**: EKS nodes spread across availability zones
4. **Image History**: All images tagged and retained in GHCR

## Performance Optimization

1. **Caching**: Multi-stage Docker builds with layer caching
2. **CDN**: CloudFront for static assets (optional)
3. **Database**: Option to use external Neo4j Aura for better performance
4. **Load Balancing**: ALB distributes traffic across pods

## Next Steps

1. Set up monitoring with Prometheus/Grafana
2. Implement log aggregation with ELK stack
3. Add API Gateway for rate limiting
4. Implement blue-green deployments
5. Add integration tests to CI/CD pipeline