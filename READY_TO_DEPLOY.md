# 🚀 PRODUCTION READY TO DEPLOY

## ✅ What's Complete

### Infrastructure
- ✅ Production Kubernetes cluster running (`starships-prod`)
- ✅ NGINX Ingress Controller installed
- ✅ cert-manager configured for SSL
- ✅ Load Balancer active: `[HARDCODED-IP]`
- ✅ DNS configured:
  - `starships.ai` → `[HARDCODED-IP]`
  - `www.starships.ai` → `[HARDCODED-IP]`
  - `dev.starships.ai` → `[HARDCODED-IP]` (unchanged)

### Kinde OAuth Production App
- ✅ Name: Starships AI Production
- ✅ Client ID: `[KINDE-PROD-CLIENT-ID]`
- ✅ Callbacks configured:
  - `[PROD-DOMAIN-URL]/api/auth/kinde_callback`
  - `https://www.starships.ai/api/auth/kinde_callback`

### Files Created
- ✅ All Kubernetes manifests in `k8s/prod/`
- ✅ Production deployment workflow: `.github/workflows/deploy-production.yml`
- ✅ Backup scripts in `scripts/`

## 🔴 Required Before First Deployment

### 1. Run Secret Setup Script
```bash
# First, export your secrets:
export OPENAI_API_KEY='your-openai-key'
export ANTHROPIC_API_KEY='your-anthropic-key'
export STRIPE_SECRET_KEY='sk_live_xxx'  # Use PRODUCTION Stripe keys
export STRIPE_PUBLISHABLE_KEY='pk_live_xxx'
export STRIPE_WEBHOOK_SECRET='whsec_xxx'
export KINDE_CLIENT_SECRET='your-kinde-secret-from-dashboard'
export GITHUB_USERNAME='your-github-username'
export GITHUB_PAT='your-github-pat-with-packages-read'

# Then run:
./scripts/setup-production-secrets.sh
```

### 2. Add Secrets to GitHub (for automated deployments)
Go to: https://github.com/[your-org]/starships.ai/settings/environments/prod

Add all the same secrets you exported above.

## 📝 Deployment Options

### Option A: Manual First Deployment
```bash
# Switch to production context
kubectl config use-context do-nyc1-starships-prod

# Apply all manifests
kubectl apply -f k8s/prod/

# Deploy the latest image
kubectl set image deployment/starships-app \
  starships=[DOCKER-REGISTRY-URL]:latest \
  -n starships-prod

# Watch the deployment
kubectl rollout status deployment/starships-app -n starships-prod
```

### Option B: GitHub Release (Recommended)
```bash
# Create a new release to trigger production deployment
gh release create v3.7.0 \
  --title "Production Launch" \
  --notes "Initial production deployment"
```

## 🔍 Monitoring Commands

```bash
# Watch pods
kubectl get pods -n starships-prod --watch

# Check logs
kubectl logs -n starships-prod -l app=starships-ai --follow

# Check ingress
kubectl get ingress -n starships-prod

# Check certificate status
kubectl get certificates -n starships-prod
```

## ⏰ DNS Propagation

DNS changes were made at 00:07 UTC. Full propagation typically takes:
- Local testing: 5-30 minutes
- Global propagation: 2-4 hours

Test DNS:
```bash
# Check DNS resolution
dig starships.ai
nslookup starships.ai

# Test with curl (once DNS propagates)
curl -I [PROD-DOMAIN-URL]
```

## 🚨 Emergency Procedures

### Rollback
```bash
./scripts/rollback-production.sh
```

### Quick Diagnostics
```bash
# Check pod events
kubectl describe pods -n starships-prod

# Check recent events
kubectl get events -n starships-prod --sort-by='.lastTimestamp'

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

## 📊 Success Criteria

1. ✅ Pods running in `starships-prod` namespace
2. ✅ Health check passing: `[PROD-DOMAIN-URL]/api/health`
3. ✅ SSL certificate valid (automatic via Let's Encrypt)
4. ✅ Login flow working with Kinde OAuth
5. ✅ Neo4j database accessible (with authentication)

## ⚠️ Important Notes

1. **Neo4j Auth**: Production uses authentication. Password: `[NEO4J-PASSWORD]`
2. **Stripe**: Make sure to use PRODUCTION keys, not test keys
3. **First Deploy**: Will take longer due to image pull and Neo4j initialization

---
**Status**: Ready to deploy after secrets configuration
**Next Action**: Run `./scripts/setup-production-secrets.sh` with your API keys