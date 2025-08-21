# GitHub Actions CI/CD Setup

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:
Go to Settings → Secrets and variables → Actions → New repository secret

### 1. DIGITALOCEAN_ACCESS_TOKEN
Your DigitalOcean API token with Kubernetes access.
- Value: `dop_v1_cbac377dc8d1ee4fb8c03f98c08b604ea3903c2e387f6025c088f1f00e2bfe2e`

### 2. GHCR_PAT (Optional - if using private packages)
GitHub Personal Access Token for pushing to GitHub Container Registry.
- Already using GITHUB_TOKEN which is automatic

### 3. KINDE_CLIENT_SECRET
Your Kinde client secret (already in Kubernetes, but add here for builds).
- Value: `IxdFNqlGrpBfYF2GFBI7uNVHhncU5QnZB000dfXjBk9VU0VHMRG`

### 4. STRIPE_SECRET_KEY (Optional)
Your Stripe secret key if needed for builds.
- Value: Your Stripe key from .env

## How the CI/CD Pipeline Works

### On Push to Main Branch:
1. **CI Workflow** (`ci.yml`):
   - Runs tests
   - Type checks
   - Builds all packages

2. **Deploy Workflow** (`deploy-to-digitalocean.yml`):
   - Builds Docker image
   - Pushes to GitHub Container Registry (ghcr.io)
   - Deploys to DigitalOcean Kubernetes
   - Updates the running pod with new image
   - Verifies deployment health

### On Pull Request:
- Only runs CI workflow (tests, build)
- No deployment

## Manual Deployment

You can also trigger deployment manually:
1. Go to Actions tab in GitHub
2. Select "Deploy to DigitalOcean Kubernetes"
3. Click "Run workflow"
4. Select branch and run

## Monitoring Deployments

### Check deployment status:
```bash
kubectl get deployments -n starships-prod
kubectl get pods -n starships-prod
kubectl logs -f deployment/starships-all -n starships-prod
```

### Rollback if needed:
```bash
kubectl rollout undo deployment/starships-all -n starships-prod
```

## Image Versioning

Images are tagged with:
- `latest` - Always points to latest main branch build
- `main-<sha>` - Specific commit on main branch
- Git SHA for traceability

## Deployment Strategy

Currently using rolling update:
- Zero downtime deployment
- Automatic rollback on failure
- Health checks ensure stability

## Troubleshooting

### If deployment fails:
1. Check GitHub Actions logs
2. Check Kubernetes pod logs:
   ```bash
   kubectl logs -l app=starships-all -n starships-prod --tail=100
   ```
3. Describe pod for events:
   ```bash
   kubectl describe pod -l app=starships-all -n starships-prod
   ```

### Common Issues:
- **Image pull errors**: Check GHCR authentication
- **Pod crashes**: Check resource limits
- **Health check failures**: May need longer startup time