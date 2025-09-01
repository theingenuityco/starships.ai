# 🚀 Post-Merge Steps for Uptime Monitoring

## Prerequisites
- ✅ Discord bot token already configured (`DISCORD_BOT_TOKEN`)
- ✅ Guild ID already configured (`DISCORD_GUILD_ID`) 
- ✅ Bot has access to your Discord server

## Channel Setup

### 1. Create/Verify Channels
- **#incidents** - Should already exist for production alerts
- **#dev-alerts** - Create in "teams" category for development alerts

### 2. Bot Permissions
Ensure the bot has these permissions in both channels:
- View Channel
- Send Messages
- Embed Links

## Immediate Actions (After PR #204 is merged)

### 1. Test Discord Bot for Production (2 minutes)
```bash
# Test production alerts to #incidents
gh workflow run test-discord-bot.yml -f environment=prod
```
Expected: Test message appears in #incidents channel

### 2. Test Discord Bot for Development (2 minutes)
```bash
# Test development alerts to #dev-alerts
gh workflow run test-discord-bot.yml -f environment=dev
```
Expected: Test message appears in #dev-alerts channel

### 3. Manual Uptime Check (2 minutes)
```bash
# Trigger manual uptime check for both environments
gh workflow run uptime-monitor.yml
```
Expected: Health status only sent if services are down (or status changes)

### 4. Verify Automated Runs (ongoing)
The workflow runs every 5 minutes automatically:
```bash
# Watch recent runs
gh run list --workflow=uptime-monitor.yml --limit=5
```

## Status Page Setup (10-15 minutes)

### 1. Enable GitHub Pages
1. Go to: https://github.com/theingenuityco/starships.ai/settings/pages
2. Source: Deploy from a branch
3. Branch: main
4. Folder: /status-page
5. Click Save

### 2. Test Status Page
After Pages is enabled (takes 2-3 minutes):
- Visit: https://theingenuityco.github.io/starships.ai/

### 3. Configure Custom Domain (Optional)
1. In Pages settings, add custom domain: uptime.starships.ai
2. Add DNS CNAME record:
   - Type: CNAME
   - Name: uptime
   - Value: theingenuityco.github.io

## Verification Checklist

- [ ] Bot test message received in #incidents
- [ ] Bot test message received in #dev-alerts
- [ ] Manual uptime check works
- [ ] Automated runs happening every 5 minutes
- [ ] Status page accessible at GitHub Pages URL
- [ ] Custom domain configured (optional)

## Troubleshooting

### Bot not sending messages?
```bash
# Check bot token exists
gh secret list | grep DISCORD_BOT_TOKEN

# Check guild ID exists
gh secret list | grep DISCORD_GUILD_ID

# View workflow logs
gh run view --log
```

### Channel not found error?
- Ensure channel names are exactly: `incidents` and `dev-alerts`
- Check bot has access to the channels
- Verify channels are text channels (not forum/voice)

### Workflows not appearing?
- Ensure PR is merged to main branch
- Wait 2-3 minutes for GitHub to index workflows

## Success Criteria
✅ Discord bot alerts on service failures
✅ Separate channels for prod (#incidents) and dev (#dev-alerts)
✅ Automatic monitoring every 5 minutes
✅ Status page showing real-time health
✅ 30-day uptime history tracking
✅ Response time monitoring

## Alert Examples

### Production Down Alert (in #incidents)
```
🚨 SERVICE DOWN
🚀 Production is currently unavailable
Service: Production
Status: down
Response: 0ms
URL: https://starships.ai
HTTP Code: 000
```

### Development Recovery Alert (in #dev-alerts)
```
✅ SERVICE RECOVERED
🛠️ Development is back online!
Service: Development
Status: operational
Response: 245ms
URL: https://dev.starships.ai
HTTP Code: 200
```