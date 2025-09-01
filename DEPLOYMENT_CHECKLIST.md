# Uptime Monitoring Deployment Checklist

## Pre-Deployment Verification

### 1. Environment Configuration ✅
- [ ] `DISCORD_ALERTS_WEBHOOK` secret added to GitHub
- [ ] `dev` environment has `CLIENT_URL` or `KINDE_SITE_URL` configured
- [ ] `prod` environment has `CLIENT_URL` or `KINDE_SITE_URL` configured

### 2. Health Endpoints 🔍
Run verification script:
```bash
chmod +x scripts/verify-health-endpoints.sh
./scripts/verify-health-endpoints.sh
```

- [ ] Production health endpoint returns 200
- [ ] Development health endpoint returns 200
- [ ] Health response includes `status` field
- [ ] Health response is valid JSON

### 3. Discord Integration 💬
Test webhook:
```bash
# Replace YOUR_WEBHOOK_URL with actual webhook
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "🧪 Test message from deployment checklist"}'
```

- [ ] Test message appears in `#system-alerts` channel
- [ ] Webhook URL is correct
- [ ] Channel permissions are set correctly

## Deployment Steps

### 1. Create Pull Request
```bash
gh pr create --title "feat: add uptime monitoring with Discord alerts" \
  --body "$(cat <<EOF
## Summary
Implements automated uptime monitoring for production and development environments with Discord notifications.

## Changes
- Added health check GitHub Actions workflow
- Discord webhook integration for alerts
- Status data persistence (preparation for status page)
- Health endpoint verification scripts

## Testing
- [ ] Discord webhook tested successfully
- [ ] Health endpoints verified
- [ ] Manual workflow trigger tested

## Checklist
- [x] Code follows project conventions
- [x] No hardcoded URLs or secrets
- [x] Documentation updated
- [ ] PR reviewed by team

## Post-Deployment
After merging, monitoring will run automatically every 5 minutes.
EOF
)"
```

### 2. Post-Merge Verification

#### Immediate (Within 5 minutes):
- [ ] Check GitHub Actions for first automated run
- [ ] Verify no error in workflow logs
- [ ] Confirm status files created in `.github/status/`

#### After 30 minutes:
- [ ] Verify consistent runs every 5 minutes
- [ ] Check Discord for any false positive alerts
- [ ] Review response time metrics

#### After 24 hours:
- [ ] Review uptime percentages
- [ ] Check for any missed alerts
- [ ] Analyze patterns in response times

## Rollback Procedure

If issues occur after deployment:

### Option 1: Disable Workflow
```bash
# Disable the workflow temporarily
gh workflow disable "Uptime Monitor"
```

### Option 2: Revert PR
```bash
# Create revert PR
gh pr create --title "revert: uptime monitoring" \
  --body "Reverting uptime monitoring due to issues"
```

### Option 3: Adjust Configuration
- Modify cron schedule in workflow (e.g., from `*/5` to `*/10`)
- Update Discord webhook if needed
- Fix environment variables

## Troubleshooting Guide

### Issue: "SERVICE_URL not set"
**Solution**: Configure `CLIENT_URL` in GitHub environment settings:
1. Go to Settings → Environments
2. Select environment (dev/prod)
3. Add variable `CLIENT_URL` with appropriate URL

### Issue: Discord alerts not appearing
**Solution**: 
1. Verify webhook URL in GitHub Secrets
2. Check Discord channel permissions
3. Test webhook manually with curl command

### Issue: False positive alerts
**Solution**:
1. Verify health endpoints are stable
2. Increase timeout in workflow (currently 10s)
3. Check for network issues

### Issue: Workflow not running
**Solution**:
1. Check GitHub Actions quotas
2. Verify workflow file syntax
3. Ensure branch protections allow Actions

## Success Criteria

### ✅ Deployment is successful when:
1. Workflow runs every 5 minutes without errors
2. Health checks accurately reflect service status
3. Discord alerts only fire on actual issues
4. No false positives in first 24 hours
5. Team receives daily summary (if configured)

## Monitoring Dashboard

After deployment, monitor at:
- **GitHub Actions**: https://github.com/theingenuityco/starships.ai/actions
- **Discord Channel**: `#system-alerts`
- **Future Status Page**: https://uptime.starships.ai (Phase 3)

## Team Contacts

For issues or questions:
- **Lead**: @prashant
- **Backend**: @brayn003
- **DevOps**: @devddev

---

**Last Updated**: January 15, 2024
**Version**: 1.0.0