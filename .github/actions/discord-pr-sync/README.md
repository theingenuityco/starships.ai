# Discord PR Sync Action

A GitHub Action that automatically syncs pull request activities to Discord threads, creating a seamless integration between GitHub and Discord for better team collaboration.

## Features

- 🔄 **Automatic Thread Creation**: Creates private Discord threads for new PRs
- 📝 **Real-time Updates**: Syncs all PR activities (comments, reviews, commits, CI status)
- 🎯 **Smart Thread Management**: Reuses existing threads, handles reopened PRs
- 🏷️ **Rich Embeds**: Beautiful Discord embeds with status indicators and colors
- 👥 **Auto-invitations**: Automatically invites mapped users and roles to threads
- 🔧 **Self-healing**: Creates missing threads automatically when needed
- 📊 **Comprehensive Event Support**: Handles 20+ different GitHub PR events

## Prerequisites

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section
4. Create a bot user and copy the token
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent

### 2. Bot Permissions

The bot needs these permissions (permission integer: `360777252928`):
- View Channels
- Send Messages
- Create Private Threads
- Send Messages in Threads
- Manage Threads
- Read Message History
- Embed Links
- Add Reactions
- Use External Emojis

### 3. Invite Bot to Server

Generate an invite link:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=360777252928&scope=bot
```

Replace `YOUR_BOT_CLIENT_ID` with your bot's client ID from the Discord Developer Portal.

## Setup

### 1. Add GitHub Secrets

In your repository settings, add these secrets:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `DISCORD_BOT_TOKEN` | Discord bot token | Discord Developer Portal → Bot → Token |
| `DISCORD_GUILD_ID` | Discord server ID | Right-click server → Copy Server ID* |
| `DISCORD_CHANNEL_ID` | Channel for threads | Right-click channel → Copy Channel ID* |
| `AUTO_INVITE_ROLE_ID` | (Optional) Role to auto-invite | Right-click role → Copy Role ID* |
| `DISCORD_USER_MAP` | (Optional) GitHub to Discord user mapping | See format below |

*Enable Developer Mode in Discord Settings → Advanced → Developer Mode

### 2. User Mapping Format

For `DISCORD_USER_MAP`, use this JSON format:
```json
{
  "github-username": "discord-user-id",
  "octocat": "123456789012345678"
}
```

### 3. Add Workflow

Create `.github/workflows/discord-pr-sync.yml`:

```yaml
name: Discord PR Sync

on:
  pull_request:
    types: [opened, closed, reopened, edited, assigned, unassigned, 
            labeled, unlabeled, synchronize, converted_to_draft, 
            ready_for_review, locked, unlocked, review_requested, 
            review_request_removed, auto_merge_enabled, auto_merge_disabled]
  pull_request_review:
    types: [submitted, edited, dismissed]
  pull_request_review_comment:
    types: [created, edited, deleted]
  issue_comment:
    types: [created, edited, deleted]
  workflow_run:
    workflows: ["*"]
    types: [requested, in_progress, completed]
  check_run:
    types: [created, rerequested, completed]
  check_suite:
    types: [completed]

permissions:
  contents: read
  pull-requests: read
  issues: read
  checks: read
  actions: read
  statuses: read

jobs:
  discord-sync:
    name: Sync to Discord
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd .github/actions/discord-pr-sync
          npm install
          cd ../../scripts
          npm install

      - name: Sync PR to Discord
        uses: ./.github/actions/discord-pr-sync
        with:
          discord-token: ${{ secrets.DISCORD_BOT_TOKEN }}
          guild-id: ${{ secrets.DISCORD_GUILD_ID }}
          channel-id: ${{ secrets.DISCORD_CHANNEL_ID }}
          auto-invite-role-id: ${{ secrets.AUTO_INVITE_ROLE_ID }}
          github-discord-map: ${{ secrets.DISCORD_USER_MAP }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Usage

Once configured, the action runs automatically on PR events:

### Thread Creation
- When a PR is opened, a private Discord thread is created
- Thread name format: `🔒 PR #123: Title`
- Initial message includes PR details and status

### Thread Updates
The thread receives updates for:
- 💬 **Comments**: New, edited, or deleted comments
- ✅ **Reviews**: Approved, changes requested, or commented
- 📦 **Commits**: New commits pushed
- 🏷️ **Labels**: Added or removed
- 👤 **Assignments**: Assigned or unassigned
- 🔄 **CI/CD**: Build and test status updates
- 🎉 **Merge/Close**: PR merged or closed

### Status Indicators
Thread names update with status emojis:
- 🔵 Open
- ⚪ Draft
- ✅ Approved
- 🔴 Changes Requested
- 🟣 Merged
- ❌ Closed

## Action Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `discord-token` | Yes | Discord bot token |
| `guild-id` | Yes | Discord server ID |
| `channel-id` | Yes | Channel for thread creation |
| `auto-invite-role-id` | No | Role ID to auto-invite to threads |
| `github-discord-map` | No | JSON mapping of GitHub to Discord users |

## Action Outputs

| Output | Description |
|--------|-------------|
| `thread-id` | Discord thread ID |
| `thread-url` | Direct URL to Discord thread |
| `action-taken` | What action was performed (created/updated/skipped) |

## Troubleshooting

### Bot Not Found Error
```
Error: Unknown Guild
```
**Solution**: Bot is not in the Discord server. Use the invite link to add it.

### Permission Errors
```
Missing permissions in channel
```
**Solution**: Ensure bot role has all required permissions in the target channel.

### Thread Not Created
- Check bot has "Create Private Threads" permission
- Verify channel is a text channel (not voice/category)
- Check GitHub secrets are correctly set

### Updates Not Appearing
- Verify workflow is running in Actions tab
- Check thread exists for the PR
- Ensure bot token is valid

## Architecture

```
GitHub Event
    ↓
Workflow Triggered
    ↓
Discord PR Sync Action
    ├── Extract PR Details
    ├── Initialize Discord Client
    ├── Check Thread State
    └── Create/Update Thread
        ├── Send Embed Message
        ├── Update Thread Status
        └── Invite Users/Roles
```

## Files Structure

```
.github/
├── actions/
│   └── discord-pr-sync/
│       ├── action.yml      # Action definition
│       ├── index.js        # Main action logic
│       ├── package.json    # Dependencies
│       └── README.md       # This file
├── scripts/
│   ├── discord-client.js   # Discord API wrapper
│   ├── state-manager.js    # Thread state persistence
│   └── package.json        # Shared dependencies
└── workflows/
    └── discord-pr-sync.yml  # Workflow configuration
```

## Event Types Supported

- **Pull Request**: opened, closed, reopened, edited, labeled, unlabeled, assigned, unassigned, synchronize, converted_to_draft, ready_for_review, locked, unlocked, review_requested, review_request_removed, auto_merge_enabled, auto_merge_disabled
- **Reviews**: submitted, edited, dismissed
- **Comments**: created, edited, deleted
- **Workflows**: requested, in_progress, completed
- **Checks**: created, rerequested, completed

## Security Considerations

- Never commit Discord tokens or secrets
- Use GitHub Secrets for all sensitive data
- Bot tokens should be rotated regularly
- Use minimal required permissions
- Private threads ensure PR discussions remain team-only

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check this README
2. Review workflow logs in GitHub Actions
3. Check Discord bot permissions
4. Verify all secrets are correctly set

## Changelog

### v1.0.0
- Initial release
- Full PR lifecycle support
- Comprehensive event handling
- Auto-invitation system
- Self-healing thread creation
- Rich embed messages
- State persistence using GitHub artifacts
