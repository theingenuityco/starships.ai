# Environment Configuration Guide

## Overview
This document outlines the correct configuration for environment variables across different deployment environments to prevent API routing issues.

## Critical Configuration Points

### API URL Configuration

#### ✅ CORRECT Configuration
```bash
# Development
NEXT_PUBLIC_API_URL=https://dev.starships.ai/api
NEXT_PUBLIC_SERVER_URL=https://dev.starships.ai/api

# Production
NEXT_PUBLIC_API_URL=https://starships.ai/api
NEXT_PUBLIC_SERVER_URL=https://starships.ai/api
```

#### ❌ INCORRECT Configuration (causes double /api path)
```bash
# This will cause API calls to fail with 404
NEXT_PUBLIC_API_URL=https://dev.starships.ai
NEXT_PUBLIC_SERVER_URL=https://dev.starships.ai
```

## How It Works

### 1. Client-Side API Calls
- The client uses `axios` with `baseURL` set to `NEXT_PUBLIC_API_URL`
- API endpoints are appended to this base URL (e.g., `/users/sync`)
- Result: `https://dev.starships.ai/api/users/sync`

### 2. Ingress Routing
```yaml
# Kubernetes Ingress Configuration
- path: /api
  backend:
    service:
      port: 3001  # Backend server
```
- Ingress routes `/api/*` requests to the backend server on port 3001
- The backend receives the path as-is (e.g., `/api/users/sync`)

### 3. Common Issue: Double `/api` Path
**Problem**: If `NEXT_PUBLIC_API_URL` doesn't include `/api`, the client makes requests to:
- `https://dev.starships.ai/api/users/sync`
- Ingress sees `/api/users/sync` and routes to backend
- Backend expects `/api/users/sync` but the path is already consumed by ingress routing

## Environment Variables Reference

### Public Variables (Available in Browser)
These are configured as GitHub Variables (not Secrets):

| Variable | Dev Environment | Production | Notes |
|----------|----------------|------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://dev.starships.ai/api` | `https://starships.ai/api` | Must include `/api` suffix |
| `NEXT_PUBLIC_SERVER_URL` | `https://dev.starships.ai/api` | `https://starships.ai/api` | Must include `/api` suffix |
| `CLIENT_URL` | `https://dev.starships.ai` | `https://starships.ai` | Frontend URL without `/api` |
| `KINDE_SITE_URL` | `https://dev.starships.ai` | `https://starships.ai` | Auth callback base URL |
| `KINDE_POST_LOGIN_REDIRECT_URL` | `https://dev.starships.ai/fleet` | `https://starships.ai/fleet` | Post-login redirect |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | `https://dev.starships.ai` | `https://starships.ai` | Post-logout redirect |

### Secret Variables (Server-Side Only)
These are configured as GitHub Secrets:

- `KINDE_CLIENT_ID`
- `KINDE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`

## Deployment Process

### 1. GitHub Actions Workflow
The workflow (`build-and-deploy.yml`) uses these variables during:
- **Docker Build**: Variables are baked into the Next.js build
- **Kubernetes Deployment**: Variables are created as Kubernetes secrets

### 2. Important Notes
- **Next.js Build Time**: `NEXT_PUBLIC_*` variables are embedded into the JavaScript bundle at build time
- **Runtime Changes**: Changing these variables requires rebuilding the Docker image
- **GitHub Variables vs Secrets**: 
  - Use Variables for public configuration
  - Use Secrets for sensitive data

## Verification Steps

### 1. Check GitHub Variables
```bash
gh variable list --repo theingenuityco/starships.ai --env dev
```

### 2. Check Kubernetes Secrets
```bash
kubectl get secret starships-secrets -n starships-dev -o json | \
  jq -r '.data.NEXT_PUBLIC_API_URL' | base64 -d
```

### 3. Verify Running Pod
```bash
kubectl exec -n starships-dev deployment/starships-app -- \
  printenv | grep NEXT_PUBLIC_API_URL
```

## Troubleshooting

### Issue: API calls returning 404
1. Check if `NEXT_PUBLIC_API_URL` includes `/api` suffix
2. Verify the value in GitHub Variables
3. Trigger a new build to apply changes (variables are baked at build time)

### Issue: Authentication redirects fail
1. Verify `KINDE_SITE_URL` matches the actual domain
2. Check `KINDE_POST_LOGIN_REDIRECT_URL` is correct
3. Ensure Kinde application settings match these URLs

## Best Practices

1. **Always include `/api` in API URLs**: Both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SERVER_URL` should end with `/api`
2. **Consistency across environments**: Maintain the same URL structure between dev and prod
3. **Document changes**: Update this guide when changing environment configuration
4. **Test after deployment**: Always verify API calls work after deploying changes
5. **Use GitHub Variables/Secrets**: Maintain configuration in GitHub, not manually in Kubernetes

## Related Files
- `.github/workflows/build-and-deploy.yml` - CI/CD pipeline configuration
- `packages/client/src/lib/env.ts` - Client environment configuration
- `packages/client/src/lib/api.ts` - API client configuration
- `k8s/dev/05-ingress.yaml` - Kubernetes ingress configuration