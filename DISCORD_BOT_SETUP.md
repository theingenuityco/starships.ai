# Discord Bot Setup for Uptime Monitoring

## You Already Have a Bot! 🎉

Your repository already has a Discord bot configured for PR syncing. We'll use the same bot for uptime monitoring.

## Existing Bot Configuration

The following secrets are already in your GitHub repository:
- `DISCORD_BOT_TOKEN` - Your bot's authentication token
- `DISCORD_GUILD_ID` - Your Discord server ID  
- `DISCORD_CHANNEL_ID` - Channel ID for PR syncing

## Channel Setup Required

### 1. Ensure Bot Has Access
Make sure your bot has access to these channels:
- **#incidents** - For production alerts
- **#dev-alerts** - For development alerts (create in "teams" category if needed)

### 2. Bot Permissions
The bot needs these permissions in both channels:
- View Channel
- Send Messages
- Embed Links
- Read Message History

## How It Works

Instead of webhooks, the bot will:
1. Login using the existing `DISCORD_BOT_TOKEN`
2. Find the channel by name (#incidents or #dev-alerts)
3. Send formatted embed messages when services go down/recover

## Advantages Over Webhooks

✅ **Works with all channel types** (including forums)
✅ **Reuses existing bot** (no new setup needed)
✅ **More control** over message formatting
✅ **Can interact** with messages (future features)
✅ **Centralized** bot management

## Testing the Bot

After the PR is merged, test with:

```bash
# Manually trigger the uptime check
gh workflow run uptime-monitor-with-bot.yml
```

## Migration Steps

1. **Update PR #204** to use the bot workflow instead of webhooks
2. **Ensure channels exist**:
   - #incidents (for production)
   - #dev-alerts in teams category (for development)
3. **Verify bot permissions** in both channels
4. **Test after merge**

## Channel Naming

The bot finds channels by name, so ensure:
- Production channel is named exactly: `incidents`
- Development channel is named exactly: `dev-alerts`

If you need different names, update the `channel_name` in the workflow matrix.