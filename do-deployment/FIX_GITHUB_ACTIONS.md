# Fix GitHub Actions Pipeline

## The Error
The "Resource not accessible by integration" errors are just telemetry warnings and can be ignored. However, the deployment likely failed because the DigitalOcean token isn't configured.

## Steps to Fix

### 1. Add the DigitalOcean Token to GitHub Secrets

1. Go to your GitHub repository: https://github.com/theingenuityco/starships.ai
2. Click **Settings** (in the repository, not your profile)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add this secret:
   - **Name**: `DIGITALOCEAN_ACCESS_TOKEN`
   - **Secret**: `<YOUR_DIGITALOCEAN_TOKEN_HERE>` (Generate from DO → API → Tokens)
6. Click **Add secret**

### 2. Check the Workflow Permissions

1. Still in Settings → Actions → General
2. Scroll down to **Workflow permissions**
3. Select **Read and write permissions**
4. Check **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

### 3. Re-run the Workflow

1. Go to the **Actions** tab in your repository
2. Click on the failed workflow run
3. Click **Re-run all jobs**

### 4. Or Trigger Manually

1. Go to **Actions** tab
2. Click **Build and Publish Docker Image**
3. Click **Run workflow**
4. Select branch: `main`
5. Click **Run workflow**

## Verify It Worked

After the workflow completes, check:

```bash
# Check if pod was updated
kubectl get pods -n starships-prod -l app=starships-all

# Check the deployment image
kubectl describe deployment starships-all -n starships-prod | grep Image

# Check events
kubectl get events -n starships-prod --sort-by='.lastTimestamp' | tail -10
```

## If It Still Fails

Check the GitHub Actions logs for the specific error. Common issues:

1. **No secret found**: The DIGITALOCEAN_ACCESS_TOKEN isn't set
2. **Invalid token**: The token expired or is incorrect
3. **Cluster not found**: The cluster name doesn't match

## Alternative: Manual Deployment Command

If the pipeline continues to fail, you can manually update the deployment:

```bash
# From your local machine
kubectl set image deployment/starships-all \
  starships=ghcr.io/theingenuityco/starships.ai:latest \
  -n starships-prod

# Watch the rollout
kubectl rollout status deployment/starships-all -n starships-prod
```