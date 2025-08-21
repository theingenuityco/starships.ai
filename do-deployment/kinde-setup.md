# Setting Up Kinde Authentication for Starships.ai

## Quick Setup Guide

### 1. Create Kinde Account
1. Go to https://kinde.com
2. Click "Get started" or "Start for free"
3. Sign up with your email
4. Create an organization (e.g., "starships-prod")

### 2. Create Application in Kinde Dashboard

1. In Kinde dashboard, go to **Applications**
2. Click **"Add application"**
3. Configure as follows:

**Application Details:**
- Name: `Starships.ai Production`
- Type: `Regular Web Application`

**Callback URLs (Important!):**
```
http://129.212.197.153/api/auth/kinde_callback
```

**Allowed logout redirect URLs:**
```
http://129.212.197.153
```

**Allowed redirect URLs:**
```
http://129.212.197.153
http://129.212.197.153/fleet
```

### 3. Get Your Credentials

After creating the application, go to the **Details** tab to find:
- **Domain**: `https://[your-subdomain].kinde.com`
- **Client ID**: (copy this)
- **Client Secret**: (copy this - keep it secret!)

### 4. Update Kubernetes Secret

Create a file called `kinde-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kinde-auth-secret
  namespace: starships-prod
type: Opaque
stringData:
  KINDE_CLIENT_ID: "your_actual_client_id_here"
  KINDE_CLIENT_SECRET: "your_actual_client_secret_here"
  KINDE_ISSUER_URL: "https://your-subdomain.kinde.com"
```

Apply it:
```bash
kubectl apply -f kinde-secret.yaml
```

### 5. Update Deployment

The deployment will use these secrets automatically.

## Testing Authentication

After setup, users can:
1. Go to http://129.212.197.153
2. Click "Login" or "Sign up"
3. Complete Kinde authentication
4. Get redirected back to your app

## Important Notes

- Kinde free tier includes:
  - Up to 10,500 monthly active users
  - Unlimited applications
  - Social logins (Google, GitHub, etc.)
  
- For production with custom domain later:
  - Update all URLs in Kinde dashboard
  - Update environment variables in deployment