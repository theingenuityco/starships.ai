# Starships.ai Deployment Guide

## 🚀 Quick Start

### Deployment Triggers

| Action | Environment | Image Tag | Automatic? |
|--------|------------|-----------|------------|
| Push to `main` | Development | `latest` | ✅ Yes |
| Create Release | Production | `prod-latest`, `prod-vX.Y.Z` | ✅ Yes |
| Manual Workflow | Dev or Prod | Based on selection | Manual |

## 📦 Image Tags

```bash
# Development (always latest from main branch)
ghcr.io/theingenuityco/starships.ai:latest

# Production (latest production release)
ghcr.io/theingenuityco/starships.ai:prod-latest
ghcr.io/theingenuityco/starships.ai:prod-v1.2.3
```

## 🔄 Deployment Workflows

### Development Deployment (Automatic)
1. Push code to `main` branch
2. GitHub Actions builds with dev environment variables
3. Image tagged as `latest`
4. Automatically deploys to `dev.starships.ai`

### Production Deployment (Release-based)
1. Create a new release on GitHub
2. GitHub Actions builds with prod environment variables
3. Image tagged as `prod-latest` and version number
4. Automatically deploys to `starships.ai`

### Manual Deployment
```bash
# Trigger dev build and deploy
gh workflow run build-and-deploy.yml -f environment=dev

# Trigger prod build and deploy
gh workflow run build-and-deploy.yml -f environment=prod

# Skip build, only deploy existing image
gh workflow run build-and-deploy.yml -f environment=prod -f skip_build=true
```

## 🔑 Environment Variables

### Development (`dev` environment)
- URLs point to `https://dev.starships.ai`
- Debug modes enabled
- Test Stripe keys

### Production (`prod` environment)
- URLs point to `https://starships.ai`
- Debug modes disabled
- Production Stripe keys (when ready)

## 🏗️ Architecture

```
GitHub Repository
├── .github/workflows/build-and-deploy.yml
│   ├── Build Dev Image (uses `dev` GitHub environment)
│   ├── Build Prod Image (uses `prod` GitHub environment)
│   ├── Deploy to Dev (DigitalOcean Kubernetes)
│   └── Deploy to Prod (DigitalOcean Kubernetes)
│
├── k8s/dev/
│   └── deployment.yaml (uses :latest image)
│
└── k8s/prod/
    └── deployment.yaml (uses :prod-latest image)
```

## 📝 Common Tasks

### Update Production to Specific Version
```bash
kubectl set image deployment/starships-app \
  starships=ghcr.io/theingenuityco/starships.ai:prod-v1.2.3 \
  -n starships-prod
```

### Rollback Production
```bash
kubectl rollout undo deployment/starships-app -n starships-prod
```

### Check Deployment Status
```bash
# Development
kubectl rollout status deployment/starships-app -n starships-dev

# Production
kubectl rollout status deployment/starships-app -n starships-prod
```

### View Logs
```bash
# Development
kubectl logs -n starships-dev deployment/starships-app --tail=100

# Production
kubectl logs -n starships-prod deployment/starships-app --tail=100
```

## 🔐 Secrets Management

### GitHub Environments
- **dev**: Contains dev URLs and test keys
- **prod**: Contains production URLs and live keys

### Update Secrets
```bash
# Update GitHub variable (URLs)
gh variable set KINDE_SITE_URL --body "https://starships.ai" --env prod

# Update GitHub secret (API keys)
gh secret set STRIPE_SECRET_KEY --env prod
```

### Kubernetes Secrets
```bash
# View current secrets
kubectl get secrets -n starships-prod

# Update a secret
kubectl create secret generic starships-secrets \
  --from-literal=NEO4J_PASSWORD="new-password" \
  -n starships-prod --dry-run=client -o yaml | kubectl apply -f -
```

## 🐛 Troubleshooting

### Build Failed
1. Check GitHub Actions logs: `gh run list --workflow=build-and-deploy.yml`
2. View detailed logs: `gh run view <run-id>`

### Deployment Failed
1. Check pod status: `kubectl get pods -n starships-prod`
2. Check pod logs: `kubectl logs -n starships-prod <pod-name>`
3. Describe pod: `kubectl describe pod -n starships-prod <pod-name>`

### Wrong URLs After Deployment
1. Verify GitHub environment variables: `gh variable list --env prod`
2. Check deployed image tag: `kubectl get deployment -n starships-prod -o yaml | grep image:`
3. Ensure using correct image (dev vs prod build)

### Authentication Issues
1. Verify Kinde OAuth app callbacks match environment URLs
2. Check Kinde secrets in Kubernetes: `kubectl get secret kinde-auth-secret -n starships-prod -o yaml`
3. Ensure cookies domain matches deployment

## 📊 Monitoring

### Health Checks
```bash
# Development
curl https://dev.starships.ai/api/health

# Production
curl https://starships.ai/api/health
```

### Resource Usage
```bash
kubectl top pods -n starships-prod
kubectl top nodes
```

## 🔄 CI/CD Pipeline Status

Check current deployments:
- [GitHub Actions](https://github.com/theingenuityco/starships.ai/actions/workflows/build-and-deploy.yml)
- [Development Site](https://dev.starships.ai)
- [Production Site](https://starships.ai)

## 📚 Related Documentation

- [Production Deployment Plan](docs/production-deployment-plan.md)
- [Kubernetes Manifests](k8s/)
- [GitHub Workflows](.github/workflows/)