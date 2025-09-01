# 🚀 Post-Merge Steps for Uptime Monitoring

## Immediate Actions (After PR #203 is merged)

### 1. Test Discord Webhook (5 minutes)
```bash
# Run the prepared test script
./test-webhook-after-merge.sh
```
Expected: Test message appears in #system-alerts channel

### 2. Manual Uptime Check (2 minutes)
```bash
# Trigger manual uptime check for both environments
gh workflow run uptime-monitor.yml
```
Expected: Health status messages for both prod and dev in Discord

### 3. Verify Automated Runs (ongoing)
The workflow runs every 5 minutes automatically. Monitor:
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

### 3. Configure Custom Domain
1. In Pages settings, add custom domain: uptime.starships.ai
2. Add DNS CNAME record:
   - Type: CNAME
   - Name: uptime
   - Value: theingenuityco.github.io

## Verification Checklist

- [ ] Discord webhook test message received
- [ ] Manual uptime check shows both environments
- [ ] Automated runs happening every 5 minutes
- [ ] Status page accessible at GitHub Pages URL
- [ ] Custom domain configured (if applicable)

## Troubleshooting

### Discord not receiving messages?
```bash
# Check webhook secret exists
gh secret list | grep DISCORD_ALERTS_WEBHOOK

# View workflow logs
gh run view --log
```

### Workflows not appearing?
- Ensure PR is merged to main branch
- Wait 2-3 minutes for GitHub to index workflows

### Status page not updating?
- Check if status.json is being committed
- Verify GitHub Pages is enabled
- Check browser cache (try incognito mode)

## Success Criteria
✅ Discord alerts on service failures
✅ Automatic monitoring every 5 minutes
✅ Status page showing real-time health
✅ 30-day uptime history tracking
✅ Response time monitoring

## Next Steps (Optional)
- Add more services to monitor
- Customize alert thresholds
- Add incident management
- Create uptime badges for README