# SSL/TLS Setup for Starships.ai

## Current Status
✅ NGINX Ingress Controller installed
✅ Cert-manager installed
✅ Let's Encrypt issuer configured
✅ Ingress with TLS configured
⏳ Waiting for DNS update and certificate

## Required DNS Change

**UPDATE YOUR DNS A RECORD:**
- Domain: `starships.ai`
- Old IP: `[HARDCODED-IP]` (old LoadBalancer)
- **New IP: `[HARDCODED-IP]`** (Ingress Controller)

## How to Update DNS

### If using Digital Ocean DNS:
```bash
doctl compute domain records update starships.ai \
  --record-id YOUR_RECORD_ID \
  --record-data [HARDCODED-IP]
```

### If using other DNS provider:
1. Log into your DNS provider
2. Find the A record for `starships.ai`
3. Change the IP from `[HARDCODED-IP]` to `[HARDCODED-IP]`
4. Save the changes

## Verify DNS Update
```bash
# Check if DNS has propagated (may take 5-30 minutes)
nslookup starships.ai
dig starships.ai

# Should return: [HARDCODED-IP]
```

## Certificate Status
Once DNS is updated, Let's Encrypt will automatically issue the certificate.

Check certificate status:
```bash
kubectl get certificate -n starships-prod
kubectl describe certificate starships-tls -n starships-prod
```

## After SSL is Working

### Update Kinde Configuration
Once HTTPS is working, update these in Kinde dashboard:
- Allowed callback URLs: `[PROD-DOMAIN-URL]/api/auth/kinde_callback`
- Allowed logout redirect URLs: `[PROD-DOMAIN-URL]`
- Application homepage: `[PROD-DOMAIN-URL]`
- Login URI: `[PROD-DOMAIN-URL]/api/auth/login`

### Update Kubernetes Secrets
```bash
kubectl apply -f do-deployment/kinde-secret-https.yaml
```

### Update Deployment Environment
All `[INSECURE-PROD-URL]` references should become `[PROD-DOMAIN-URL]`

## Troubleshooting

### Certificate not issuing?
1. Check DNS has propagated: `nslookup starships.ai`
2. Check certificate status: `kubectl describe certificate starships-tls -n starships-prod`
3. Check cert-manager logs: `kubectl logs -n cert-manager deployment/cert-manager`
4. Check ingress: `kubectl get ingress -n starships-prod`

### Site not accessible?
1. Check ingress controller: `kubectl get svc -n ingress-nginx`
2. Check ingress rules: `kubectl describe ingress starships-ingress -n starships-prod`
3. Check pod status: `kubectl get pods -n starships-prod`

## Benefits of This Setup
✅ **Free SSL certificates** from Let's Encrypt
✅ **Auto-renewal** every 90 days
✅ **HTTP to HTTPS redirect** automatic
✅ **Secure cookies** work properly
✅ **No more Kinde error 1656**
✅ **Better SEO and user trust**