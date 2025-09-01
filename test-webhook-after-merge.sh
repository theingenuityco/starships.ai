#!/bin/bash

# Test script to verify Discord webhook after PR merge
# Run this immediately after PR #203 is merged

echo "🚀 Testing Uptime Monitor Discord Integration"
echo "============================================"
echo ""

# Step 1: Verify webhook secret exists
echo "1️⃣ Checking GitHub Secrets..."
gh secret list | grep -q DISCORD_ALERTS_WEBHOOK
if [ $? -eq 0 ]; then
    echo "✅ DISCORD_ALERTS_WEBHOOK secret exists"
else
    echo "❌ DISCORD_ALERTS_WEBHOOK secret not found!"
    echo "Please add it at: https://github.com/theingenuityco/starships.ai/settings/secrets/actions"
    exit 1
fi

# Step 2: Trigger the test webhook workflow
echo ""
echo "2️⃣ Triggering Discord webhook test..."
gh workflow run test-discord-webhook.yml
if [ $? -eq 0 ]; then
    echo "✅ Test workflow triggered successfully"
    echo ""
    echo "📢 Check your Discord #system-alerts channel for the test message!"
    echo ""
    
    # Get the run ID
    sleep 2
    RUN_ID=$(gh run list --workflow=test-discord-webhook.yml --limit=1 --json databaseId --jq '.[0].databaseId')
    
    if [ -n "$RUN_ID" ]; then
        echo "📊 Monitor the workflow run here:"
        echo "https://github.com/theingenuityco/starships.ai/actions/runs/$RUN_ID"
        echo ""
        echo "Or watch it in terminal with:"
        echo "gh run watch $RUN_ID"
    fi
else
    echo "❌ Failed to trigger test workflow"
    echo "The workflow might not be available yet. Wait a few minutes after merge."
fi

echo ""
echo "3️⃣ Next: Trigger manual uptime check..."
echo ""
echo "After verifying Discord test works, run:"
echo "gh workflow run uptime-monitor.yml"
echo ""
echo "This will immediately check both production and development environments."