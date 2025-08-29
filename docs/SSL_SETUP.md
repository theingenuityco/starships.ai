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
- Old IP: `129.212.197.153` (old LoadBalancer)
- **New IP: `161.35.254.226`** (Ingress Controller)

## How to Update DNS

### If using Digital Ocean DNS:
```bash
doctl compute domain records update starships.ai \
  --record-id YOUR_RECORD_ID \
  --record-data 161.35.254.226
```

### If using other DNS provider:
1. Log into your DNS provider
2. Find the A record for `starships.ai`
3. Change the IP from `129.212.197.153` to `161.35.254.226`
4. Save the changes

## Verify DNS Update
```bash
# Check if DNS has propagated (may take 5-30 minutes)
nslookup starships.ai
dig starships.ai

# Should return: 161.35.254.226
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
- Allowed callback URLs: `https://starships.ai/api/auth/kinde_callback`
- Allowed logout redirect URLs: `https://starships.ai`
- Application homepage: `https://starships.ai`
- Login URI: `https://starships.ai/api/auth/login`

### Update Kubernetes Secrets
```bash
kubectl apply -f do-deployment/kinde-secret-https.yaml
```

### Update Deployment Environment
All `http://starships.ai` references should become `https://starships.ai`

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