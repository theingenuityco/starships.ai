# Secret Management Best Practices

## ⚠️ CRITICAL: Never Commit Secrets

**NEVER** commit actual secret values to Git. This includes:
- API tokens
- Passwords
- Client secrets
- Private keys
- Database credentials

## How to Store Secrets Safely

### 1. GitHub Secrets (Recommended)
Store all secrets in GitHub Settings → Secrets and Variables → Actions:
- `DIGITALOCEAN_ACCESS_TOKEN`
- `KINDE_CLIENT_ID`
- `KINDE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `NEO4J_PASSWORD`

### 2. Kubernetes Secrets
Create secrets directly in the cluster:
```bash
kubectl create secret generic app-secrets \
  --from-literal=KEY=VALUE \
  -n namespace
```

### 3. Local Development
Use `.env` files (already in .gitignore):
```bash
# .env.local
KINDE_CLIENT_SECRET=your_actual_secret_here
```

## Template Files

When documenting, use placeholders:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-secret
stringData:
  API_KEY: "<YOUR_API_KEY_HERE>"  # ✅ Good
  # NOT: API_KEY: "[STRIPE-LIVE-SECRET-KEY]"  # ❌ BAD!
```

## If You Accidentally Commit a Secret

1. **Immediately revoke/rotate the exposed secret**
2. Remove from the repository
3. Use `git filter-branch` or BFG Repo-Cleaner to remove from history
4. Force push the cleaned history
5. Notify team members

## Security Checklist

- [ ] All secret files end with `.secret.yaml` or are in `secrets/` folder
- [ ] `.gitignore` includes patterns for secret files
- [ ] Documentation uses `<PLACEHOLDER>` format
- [ ] GitHub Actions use repository secrets
- [ ] Production secrets are different from dev
- [ ] Secrets are rotated regularly (every 90 days)

## Current Production Secrets Needed

For production deployment, you need these in GitHub Secrets:

| Secret Name | Description | Where to Get |
|------------|-------------|--------------|
| `DIGITALOCEAN_ACCESS_TOKEN` | DO API access | DigitalOcean → API → Tokens |
| `KINDE_CLIENT_ID` | OAuth client ID | Kinde Dashboard → Applications |
| `KINDE_CLIENT_SECRET` | OAuth secret | Kinde Dashboard → Applications |
| `KINDE_ISSUER_URL` | Kinde domain | https://[your-domain].kinde.com |
| `NEO4J_PASSWORD` | Database password | Generate with `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenAI API | OpenAI Dashboard |
| `ANTHROPIC_API_KEY` | Claude API | Anthropic Console |
| `STRIPE_SECRET_KEY` | Payment processing | Stripe Dashboard (live mode) |
| `STRIPE_PUBLISHABLE_KEY` | Public Stripe key | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing | Stripe Webhooks settings |

## Remember

🔐 **Security is everyone's responsibility**
- If you see a secret in code, remove it immediately
- Always use environment variables or secret management
- Rotate secrets if there's any doubt about exposure