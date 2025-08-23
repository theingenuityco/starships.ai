# Secrets Management Guide

## Current Secrets Architecture

### Where Secrets Live
1. **Kubernetes Secrets** - In DigitalOcean cluster (production runtime)
2. **GitHub Secrets** - For CI/CD pipeline
3. **Local .env** - For local development (git-ignored)

## View Current Secrets

```bash
# List all secrets
kubectl get secrets -n starships-prod

# View secret keys (not values)
kubectl get secret starships-secrets -n starships-prod -o json | jq '.data | keys'

# Decode a specific secret (be careful!)
kubectl get secret starships-secrets -n starships-prod -o json | jq -r '.data.OPENAI_API_KEY' | base64 -d
```

## Update Existing Secrets

### Method 1: Update Entire Secret
```bash
kubectl create secret generic starships-secrets \
  --from-literal=OPENAI_API_KEY="sk-new-key-here" \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-new-key" \
  --from-literal=STRIPE_SECRET_KEY="sk_test_new" \
  --from-literal=STRIPE_WEBHOOK_SECRET="whsec_new" \
  --from-literal=NEO4J_PASSWORD="new[DEFAULT-PASSWORD]" \
  --namespace starships-prod \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Method 2: Update Single Value
```bash
# First, get current secret
kubectl get secret starships-secrets -n starships-prod -o json > temp-secret.json

# Edit the specific value (base64 encode new value)
echo -n "new-api-key" | base64
# Add this to temp-secret.json

# Apply updated secret
kubectl apply -f temp-secret.json
```

### Method 3: Using kubectl edit
```bash
kubectl edit secret starships-secrets -n starships-prod
# This opens in vim, edit the base64 values
```

## Add New Secrets

### Create new secret file
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: new-service-secret
  namespace: starships-prod
type: Opaque
stringData:  # Use stringData for plain text (auto base64)
  NEW_API_KEY: "actual-key-value"
  ANOTHER_SECRET: "another-value"
```

Apply it:
```bash
kubectl apply -f new-secret.yaml
```

## Restart Pod After Secret Update

Secrets are loaded at pod startup, so after updating:

```bash
# Restart the deployment
kubectl rollout restart deployment/starships-all -n starships-prod

# Watch the rollout
kubectl rollout status deployment/starships-all -n starships-prod
```

## Security Best Practices

### Current Setup ✅
- Secrets isolated in Kubernetes
- Not committed to Git
- Separate secrets by purpose
- Using native K8s secrets

### Recommended Improvements 🔧

1. **Use Sealed Secrets or SOPS**
   - Encrypt secrets at rest
   - Allow secrets in Git (encrypted)

2. **Use External Secret Manager**
   - HashiCorp Vault
   - AWS Secrets Manager
   - DigitalOcean Secrets (when available)

3. **Implement Secret Rotation**
   - Regular key rotation
   - Automated updates

4. **Use Service Accounts**
   - Pod-specific permissions
   - Principle of least privilege

5. **Enable Audit Logging**
   - Track secret access
   - Monitor for suspicious activity

## Emergency: If Secrets Are Compromised

1. **Immediately rotate all keys:**
```bash
# Generate new keys from providers (OpenAI, Stripe, etc.)
# Update the secrets
kubectl create secret generic starships-secrets \
  --from-literal=OPENAI_API_KEY="sk-new-emergency-key" \
  # ... other keys
  --namespace starships-prod \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deployment/starships-all -n starships-prod
```

2. **Check logs for unauthorized access:**
```bash
kubectl logs deployment/starships-all -n starships-prod --since=24h | grep -i "auth\|api\|key"
```

3. **Review GitHub Actions logs** for any exposure

## Backup Secrets

```bash
# Backup all secrets to encrypted file
kubectl get secrets -n starships-prod -o yaml > secrets-backup-$(date +%Y%m%d).yaml
# Encrypt this file immediately!
gpg -c secrets-backup-*.yaml
# Delete unencrypted version
rm secrets-backup-*.yaml
```

## Testing Secret Access

```bash
# Test from inside pod
kubectl exec -it deployment/starships-all -n starships-prod -- env | grep OPENAI
kubectl exec -it deployment/starships-all -n starships-prod -- env | grep KINDE
```