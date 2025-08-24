# Kinde Authentication Setup for Starships.ai

## Required Kinde Application Settings

### 1. Application Details
- **Application Type**: Traditional Web Application (Server-side)
- **Client ID**: `[KINDE-CLIENT-ID]`
- **Issuer URL**: `[KINDE-ISSUER-URL]`

### 2. Allowed Callback URLs
You MUST add the following callback URL to your Kinde application settings:
```
[INSECURE-PROD-URL]/api/auth/kinde_callback
```

### 3. Allowed Logout Redirect URLs
Add the following logout URL:
```
[INSECURE-PROD-URL]
```

### 4. Application URLs
Configure these URLs in your Kinde application:
- **Login redirect URL**: `[INSECURE-PROD-URL]/fleet`
- **Logout redirect URL**: `[INSECURE-PROD-URL]`

## How to Configure in Kinde Dashboard

1. Go to your Kinde dashboard: [KINDE-ISSUER-URL]
2. Navigate to **Applications** → **Your Application** → **Application details**
3. In the **Allowed callback URLs** section, add:
   - `[INSECURE-PROD-URL]/api/auth/kinde_callback`
4. In the **Allowed logout redirect URLs** section, add:
   - `[INSECURE-PROD-URL]`
5. Save the changes

## Error 1656 Resolution

If you're seeing **Error code: 1656**, this typically means:
- The callback URL (`[INSECURE-PROD-URL]/api/auth/kinde_callback`) is not registered in Kinde
- There's a mismatch between the configured URLs

### Current Application Configuration
The application is configured to use:
- **Callback URL**: `[INSECURE-PROD-URL]/api/auth/kinde_callback`
- **Site URL**: `[INSECURE-PROD-URL]`
- **Post-login redirect**: `[INSECURE-PROD-URL]/fleet`
- **Post-logout redirect**: `[INSECURE-PROD-URL]`

## Verification Steps

1. Check that the callback URL is registered:
   ```bash
   curl -I [INSECURE-PROD-URL]/api/auth/login
   ```
   Look for the `redirect_uri` parameter in the `location` header.

2. Verify environment variables in the deployment:
   ```bash
   kubectl exec -n starships-prod deployment/starships-app -- printenv | grep KINDE
   ```

3. Test authentication flow:
   - Open an incognito/private browser window
   - Navigate to [INSECURE-PROD-URL]
   - Click the login button
   - You should be redirected to Kinde for authentication

## Troubleshooting

If authentication still fails after adding the callback URL:
1. Clear browser cache and cookies
2. Use an incognito/private browser window
3. Check Kinde application logs for more details
4. Ensure your user email is provisioned in Kinde