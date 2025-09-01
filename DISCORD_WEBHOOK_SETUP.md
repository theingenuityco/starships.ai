# Discord Webhook Setup Guide

## Channel Configuration

### Production Alerts → #incident channel
1. Go to the **#incident** channel in Discord
2. Click the gear icon (Edit Channel)
3. Go to **Integrations** → **Webhooks**
4. Click **New Webhook**
5. Name it: "Starships Prod Monitor"
6. Copy the webhook URL
7. Add to GitHub Secrets as `DISCORD_PROD_WEBHOOK`

### Development Alerts → #dev-alerts channel (in teams category)
1. Create **#dev-alerts** channel in the "teams" category (if not exists)
2. Click the gear icon (Edit Channel)
3. Go to **Integrations** → **Webhooks**
4. Click **New Webhook**
5. Name it: "Starships Dev Monitor"
6. Copy the webhook URL
7. Add to GitHub Secrets as `DISCORD_DEV_WEBHOOK`

## GitHub Secrets Configuration

Add these secrets at: https://github.com/theingenuityco/starships.ai/settings/secrets/actions

```
DISCORD_PROD_WEBHOOK = [webhook URL from #incident channel]
DISCORD_DEV_WEBHOOK = [webhook URL from #dev-alerts channel]
```

## Testing

After merge, test each webhook:

### Test Production Webhook
```bash
gh workflow run test-discord-webhook.yml -f environment=prod
```
Check #incident channel for test message

### Test Development Webhook
```bash
gh workflow run test-discord-webhook.yml -f environment=dev
```
Check #dev-alerts channel for test message

## What Gets Alerted Where

### #incident Channel (Production Only)
- ❌ Production down alerts
- ✅ Production recovery notifications
- 📊 Daily summary reports (both prod & dev stats)
- ⏱️ Production timeout warnings

### #dev-alerts Channel (Development Only)
- ❌ Development environment down alerts
- ✅ Development recovery notifications
- ⏱️ Development timeout warnings

## Alert Format

Both channels receive the same rich embed format with:
- Service name and status
- Response time
- HTTP status code
- Timestamp
- Direct link to the affected environment

The only difference is the destination channel based on which environment triggered the alert.