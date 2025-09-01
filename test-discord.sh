#!/bin/bash

# Test Discord Webhook
# This script tests if your Discord webhook is working

echo "🧪 Testing Discord Webhook..."

# You'll need to replace this with your actual webhook URL
# Get it from GitHub Secrets page or Discord channel settings
WEBHOOK_URL="YOUR_WEBHOOK_URL_HERE"

# Send test message
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "embeds": [{
      "title": "🧪 Webhook Test Successful!",
      "description": "Your Discord webhook is properly configured and ready for uptime monitoring.",
      "color": 5814783,
      "fields": [
        {
          "name": "Test Type",
          "value": "Direct webhook test",
          "inline": true
        },
        {
          "name": "Time",
          "value": "'"$(date -u '+%Y-%m-%d %H:%M:%S UTC')"'",
          "inline": true
        }
      ],
      "footer": {
        "text": "Starships Uptime Monitor"
      }
    }]
  }'

echo "✅ Test message sent! Check your Discord #system-alerts channel"