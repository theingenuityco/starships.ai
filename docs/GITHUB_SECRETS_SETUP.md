# GitHub Secrets Configuration Guide

This document outlines all the GitHub secrets that must be configured for both `dev` and `prod` environments to enable proper deployment to Digital Ocean Kubernetes clusters.

## Environment Configuration

GitHub repository settings should have two environments configured:
- `dev` - Used for automatic deployments on main branch
- `prod` - Used for manual production deployments

## Required Secrets for Both Environments

### Core API Keys
| Secret Name | Description | Example |
|------------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI features | `sk-proj-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude integration | `sk-ant-api03-...` |

### Stripe Configuration
| Secret Name | Description | Example |
|------------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` or `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_test_...` or `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |

### Kinde OAuth Configuration
| Secret Name | Description | Example |
|------------|-------------|---------|
| `KINDE_CLIENT_ID` | Kinde OAuth client ID | `95be67f7...` |
| `KINDE_CLIENT_SECRET` | Kinde OAuth client secret | `1OXzXWT...` |
| `KINDE_ISSUER_URL` | Kinde issuer URL | `[KINDE-ISSUER-URL]` |

### Database Configuration
| Secret Name | Description | Example |
|------------|-------------|---------|
| `NEO4J_PASSWORD` | Neo4j database password | Strong generated password |

### Infrastructure
| Secret Name | Description | Example |
|------------|-------------|---------|
| `DIGITALOCEAN_ACCESS_TOKEN` | Digital Ocean API token for cluster access | `dop_v1_...` |
| `GHCR_PULL_TOKEN` | GitHub Personal Access Token with `packages:read` | `ghp_...` |

## Environment-Specific Secrets

### Dev Environment (`dev`)

| Secret Name | Description | Value |
|------------|-------------|-------|
| `CLIENT_URL` | Frontend base URL | `[DEV-DOMAIN-URL]` |
| `NEXT_PUBLIC_API_URL` | Public API URL for frontend | `[DEV-DOMAIN-URL]/api` |
| `NEXT_PUBLIC_SERVER_URL` | Public server URL for frontend | `[DEV-DOMAIN-URL]/api` |
| `KINDE_SITE_URL` | Base URL for Kinde auth | `[DEV-DOMAIN-URL]` |
| `KINDE_POST_LOGIN_REDIRECT_URL` | Post-login redirect | `[DEV-DOMAIN-URL]/fleet` |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | Post-logout redirect | `[DEV-DOMAIN-URL]` |
| `KINDE_REDIRECT_URL` | OAuth callback URL | `[DEV-DOMAIN-URL]/api/auth/kinde_callback` |
| `KINDE_COOKIE_DOMAIN` | Cookie domain for auth | `dev.starships.ai` |

### Production Environment (`prod`)

| Secret Name | Description | Value |
|------------|-------------|-------|
| `CLIENT_URL` | Frontend base URL | `[PROD-DOMAIN-URL]` |
| `NEXT_PUBLIC_API_URL` | Public API URL for frontend | `[PROD-DOMAIN-URL]/api` |
| `NEXT_PUBLIC_SERVER_URL` | Public server URL for frontend | `[PROD-DOMAIN-URL]/api` |
| `KINDE_SITE_URL` | Base URL for Kinde auth | `[PROD-DOMAIN-URL]` |
| `KINDE_POST_LOGIN_REDIRECT_URL` | Post-login redirect | `[PROD-DOMAIN-URL]/fleet` |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | Post-logout redirect | `[PROD-DOMAIN-URL]` |
| `KINDE_REDIRECT_URL` | OAuth callback URL | `[PROD-DOMAIN-URL]/api/auth/kinde_callback` |

## Optional Secrets

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `RELEASE_TOKEN` | GitHub token for semantic-release | Automated versioning |

## Setting Up Secrets in GitHub

1. Navigate to your repository on GitHub
2. Go to Settings → Secrets and variables → Actions
3. Click on "Environments"
4. Create two environments: `dev` and `prod`
5. For each environment, add the secrets listed above

### Example GitHub CLI Commands

```bash
# Set secrets for dev environment
gh secret set OPENAI_API_KEY --env dev --body "sk-proj-..."
gh secret set CLIENT_URL --env dev --body "[DEV-DOMAIN-URL]"
gh secret set NEXT_PUBLIC_API_URL --env dev --body "[DEV-DOMAIN-URL]/api"
gh secret set NEXT_PUBLIC_SERVER_URL --env dev --body "[DEV-DOMAIN-URL]/api"
gh secret set KINDE_SITE_URL --env dev --body "[DEV-DOMAIN-URL]"
gh secret set KINDE_POST_LOGIN_REDIRECT_URL --env dev --body "[DEV-DOMAIN-URL]/fleet"
gh secret set KINDE_COOKIE_DOMAIN --env dev --body "dev.starships.ai"

# Set secrets for prod environment  
gh secret set OPENAI_API_KEY --env prod --body "sk-proj-..."
gh secret set CLIENT_URL --env prod --body "[PROD-DOMAIN-URL]"
gh secret set NEXT_PUBLIC_API_URL --env prod --body "[PROD-DOMAIN-URL]/api"
gh secret set NEXT_PUBLIC_SERVER_URL --env prod --body "[PROD-DOMAIN-URL]/api"
gh secret set KINDE_SITE_URL --env prod --body "[PROD-DOMAIN-URL]"
gh secret set KINDE_POST_LOGIN_REDIRECT_URL --env prod --body "[PROD-DOMAIN-URL]/fleet"
```

## Deployment Workflow

### Dev Deployment (Automatic)
- Triggers on push to `main` branch
- Uses secrets from `dev` environment
- Deploys to `starships-dev` namespace on Digital Ocean

### Production Deployment (Manual)
- Triggered manually via GitHub Actions
- Uses secrets from `prod` environment
- Deploys to `starships-prod` namespace on Digital Ocean
- Requires typing "DEPLOY" to confirm

## Security Best Practices

1. **Never commit secrets to the repository**
2. **Use different API keys for dev and prod** (especially for Stripe)
3. **Rotate secrets regularly**
4. **Use strong, generated passwords for databases**
5. **Limit GitHub PAT permissions to minimum required** (`packages:read` for GHCR)
6. **Keep production Kinde app separate from development**

## Verification

After setting up secrets, you can verify they're configured correctly:

```bash
# List secrets for an environment
gh secret list --env dev
gh secret list --env prod

# Test deployment workflow
gh workflow run build-and-deploy.yml   # For dev
gh workflow run deploy-production.yml  # For prod
```

## Troubleshooting

### Common Issues

1. **Deployment fails with "imagePullBackOff"**
   - Check `GHCR_PULL_TOKEN` is set correctly
   - Verify token has `packages:read` permission

2. **Authentication errors**
   - Verify Kinde URLs match your environment
   - Check `KINDE_CLIENT_ID` and `KINDE_CLIENT_SECRET` are correct

3. **Database connection failures**
   - Ensure `NEO4J_PASSWORD` matches what's configured in the cluster
   - Check if Neo4j service is running

4. **Stripe webhook failures**
   - Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
   - Ensure webhook endpoint URL is correct

## Updates Required

When updating these secrets, remember to:
1. Update both dev and prod environments as needed
2. Trigger a new deployment to apply changes
3. Monitor application logs for any authentication issues