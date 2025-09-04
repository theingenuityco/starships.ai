# GitHub App Setup Guide

## Step 1: Create GitHub App

1. Go to your GitHub organization settings
2. Navigate to **Developer settings** → **GitHub Apps** → **New GitHub App**

## Step 2: Configure Basic Information

Fill in the following:

- **GitHub App name**: `starships-runner-controller`
- **Homepage URL**: `https://github.com/YOUR_ORG/YOUR_REPO`
- **Webhook URL**: `https://PENDING.execute-api.us-east-1.amazonaws.com/prod/webhook` (update after Lambda deployment)
- **Webhook secret**: Generate a strong secret and save it:
  ```bash
  openssl rand -hex 32
  ```
  Save this as `GITHUB_WEBHOOK_SECRET`

## Step 3: Set Permissions

Configure the following repository permissions:

- **Actions**: Read
- **Administration**: Read & Write
- **Checks**: Read
- **Contents**: Read
- **Metadata**: Read
- **Pull requests**: Read

## Step 4: Subscribe to Events

Check the following webhook events:

- ✅ **Workflow job**

## Step 5: Create and Install

1. Click **Create GitHub App**
2. Note down the **App ID** (you'll see it on the app's settings page)
3. Scroll down to **Private keys** section
4. Click **Generate a private key**
5. Download the `.pem` file and save it securely

## Step 6: Install App to Repository

1. In the GitHub App settings, click **Install App**
2. Choose your organization
3. Select **Only select repositories**
4. Choose the `new-starships` repository
5. Click **Install**

## Step 7: Save Configuration

Create a file `github-app-config.env` with the following (DO NOT COMMIT):

```bash
# GitHub App Configuration
export GITHUB_APP_ID="YOUR_APP_ID"
export GITHUB_APP_INSTALLATION_ID="YOUR_INSTALLATION_ID"  # Found in the URL after installation
export GITHUB_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
export GITHUB_APP_PRIVATE_KEY_PATH="/path/to/downloaded-private-key.pem"
export GITHUB_REPOSITORY="YOUR_ORG/new-starships"
```

## Step 8: Get Installation ID

After installing the app, the URL will look like:
```
https://github.com/organizations/YOUR_ORG/settings/installations/12345678
```
The number at the end (12345678) is your Installation ID.

## Step 9: Encode Private Key

For use in Lambda, encode the private key:

```bash
base64 -i downloaded-private-key.pem | tr -d '\n' > github-app-private-key-base64.txt
```

## Verification Checklist

- [ ] GitHub App created with correct permissions
- [ ] Webhook secret generated and saved
- [ ] Private key downloaded and encoded
- [ ] App installed on the repository
- [ ] App ID and Installation ID noted
- [ ] Configuration file created (not committed)

## Next Steps

Proceed to deploy the AWS infrastructure using Terraform with these configuration values.