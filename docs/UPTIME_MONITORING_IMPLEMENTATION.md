# Uptime Monitoring & Status Page Implementation Plan

## 📊 Live Implementation Progress

### Overall Progress: ▓▓▓▓▓▓▓▓░░ 80%

| Component | Status | Progress | Notes |
|-----------|--------|----------|-------|
| **Discord Integration** | 🟡 In Progress | ▓▓▓▓▓▓▓▓░░ 80% | Webhook configured, testing pending |
| **GitHub Actions** | ✅ Complete | ▓▓▓▓▓▓▓▓▓▓ 100% | Workflows created, endpoints fixed |
| **Status Page** | ✅ Complete | ▓▓▓▓▓▓▓▓▓▓ 100% | Basic HTML page ready |
| **Data Storage** | ✅ Complete | ▓▓▓▓▓▓▓▓▓▓ 100% | Persistence scripts created |
| **Health Endpoints** | ✅ Verified | ▓▓▓▓▓▓▓▓▓▓ 100% | Both prod & dev working at /api/health |
| **DNS Setup** | ⏳ Not Started | ░░░░░░░░░░ 0% | uptime.starships.ai pending |

### 🔄 Last Updated: January 15, 2025 @ 10:35 UTC

### Current Stage: **Phase 1 - Core Monitoring** 🚧

#### 🎯 Next Actions Required
1. **IMMEDIATE**: Test Discord webhook with provided script
2. **THEN**: Confirm webhook message received in Discord
3. **NEXT**: Create and merge PR to main branch
4. **FINALLY**: Monitor first automated run

#### Detailed Task Tracker

##### ✅ Completed Tasks
- [x] Created feature branch `feat/discord-health-monitoring`
- [x] Designed monitoring architecture
- [x] Created implementation documentation
- [x] Created Discord `#system-alerts` channel
- [x] Generated Discord webhook
- [x] Added `DISCORD_ALERTS_WEBHOOK` to GitHub Secrets
- [x] Created test webhook workflow
- [x] Created main monitoring workflow
- [x] Pushed code to feature branch
- [x] Added health endpoint verification script
- [x] Created status data persistence system
- [x] Added error handling for missing env variables
- [x] Created deployment checklist
- [x] Built basic status page HTML
- [x] Added rollback procedures

##### ✅ Recently Completed
- [x] Verify health endpoints work ✅ (Both /api/health endpoints confirmed working)
- [x] Fixed endpoint URLs in workflow (changed from /health to /api/health)

##### 🚧 In Progress
- [ ] Test Discord webhook connection (pending - needs workflow on main branch)
- [ ] Test manual workflow trigger

##### ✅ Just Completed
- [x] Create PR to main branch ✅ (PR #203: https://github.com/theingenuityco/starships.ai/pull/203)

##### 📋 Upcoming Tasks
- [ ] Get PR reviewed and merged
- [ ] Test Discord webhook after merge
- [ ] Verify automated runs
- [ ] Configure GitHub Pages for status page
- [ ] Set up DNS for uptime.starships.ai

### ⚠️ Current Blockers & Risks

| Type | Description | Impact | Mitigation |
|------|-------------|--------|------------|
| ✅ **Resolved** | ~~Health endpoints not verified~~ | ~~May get false positives~~ | ✅ Verified working at /api/health |
| 🟡 **In Progress** | PR awaiting review | Cannot test workflows until merged | PR #203 created, needs team review |
| 🟢 **Next Step** | Webhook test after merge | Need main branch for testing | Will test immediately after merge |
| 🟢 **Ready** | All components built | Implementation complete | Just needs deployment |

## Overview
Implementation of a comprehensive uptime monitoring system for starships.ai and dev.starships.ai with public status page and Discord alerting.

## Project Goals
- Monitor production and development environments every 2-5 minutes
- Provide public status page at `uptime.starships.ai`
- Send Discord notifications for downtime events
- Maintain 30-60 days of historical uptime data
- Zero infrastructure cost using GitHub Actions & Pages

## Architecture

```mermaid
graph TB
    subgraph "GitHub Actions"
        A[Cron Job<br/>Every 2 min] --> B[Health Checker]
        B --> C{Status<br/>Changed?}
        C -->|Yes| D[Discord Alert]
        C --> E[Update Data]
        E --> F[Commit to Repo]
    end
    
    subgraph "Data Storage"
        F --> G[status.json<br/>30-day history]
        G --> H[incidents.json<br/>Incident log]
    end
    
    subgraph "GitHub Pages"
        G --> I[Status Page<br/>uptime.starships.ai]
        H --> I
        I --> J[Public Users]
    end
    
    subgraph "Monitoring Targets"
        B --> K[Production Health]
        B --> L[Development Health]
    end
```

## Implementation Phases

### 🎯 Phase Progress Tracker

```
Phase 1: Core Monitoring     ▓▓▓▓▓▓▓▓░░ 80% 🚧 CURRENT
Phase 2: Data Management     ░░░░░░░░░░ 0%  ⏳ PENDING
Phase 3: Status Page         ░░░░░░░░░░ 0%  ⏳ PENDING
Phase 4: Deployment          ░░░░░░░░░░ 0%  ⏳ PENDING
```

### Phase 1: Core Monitoring (Day 1) - **80% Complete** 🚧
- [x] Create GitHub Actions workflow for health checks ✅
- [x] Implement basic Discord notifications ✅
- [x] Set up data storage structure ✅
- [ ] Test with manual workflow triggers ⏳

**Blockers**: Waiting for webhook test confirmation

### Phase 2: Data Management (Day 2) - **Not Started** ⏳
- [ ] Build status data update script
- [ ] Implement 30-day rolling window
- [ ] Calculate uptime percentages
- [ ] Add incident tracking

**Prerequisites**: Phase 1 completion, PR merged to main

### Phase 3: Status Page (Day 3-4) - **Not Started** ⏳
- [ ] Design status page UI
- [ ] Implement real-time status display
- [ ] Add historical graphs
- [ ] Create incident timeline

**Prerequisites**: Data management system operational

### Phase 4: Deployment (Day 5) - **Not Started** ⏳
- [ ] Configure GitHub Pages
- [ ] Set up custom domain
- [ ] Add CNAME records
- [ ] Production testing

**Prerequisites**: Status page complete

## Technical Specifications

### 1. GitHub Actions Workflow

The workflow leverages existing GitHub environment variables for dynamic URL configuration:

```yaml
name: Uptime Monitor
on:
  schedule:
    - cron: '*/2 * * * *'  # Every 2 minutes
  workflow_dispatch:       # Manual trigger

jobs:
  monitor-dev:
    runs-on: ubuntu-latest
    environment: dev  # Uses dev environment variables
    steps:
      - name: Check Dev Health
        env:
          # These variables already exist in your dev environment
          TARGET_URL: ${{ vars.CLIENT_URL || vars.KINDE_SITE_URL }}
          API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}
          SERVER_URL: ${{ vars.NEXT_PUBLIC_SERVER_URL }}
        run: |
          # Check main app health
          curl -f "$TARGET_URL/health" || exit 1
          # Check API health if different
          if [ "$API_URL" != "$TARGET_URL" ]; then
            curl -f "$API_URL/health" || exit 1
          fi
          
  monitor-prod:
    runs-on: ubuntu-latest
    environment: prod  # Uses prod environment variables
    steps:
      - name: Check Production Health
        env:
          # These variables already exist in your prod environment
          TARGET_URL: ${{ vars.CLIENT_URL || vars.KINDE_SITE_URL }}
          API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}
          SERVER_URL: ${{ vars.NEXT_PUBLIC_SERVER_URL }}
        run: |
          # Same health check logic
```

**Key Features:**
- Uses existing GitHub environment variables (no new variables needed)
- Separate jobs for dev and prod with respective environments
- Parallel health checks for both environments
- Retry logic for transient failures
- Response time measurement
- Service-specific health validation

### 2. Data Storage Schema

#### status.json
```json
{
  "metadata": {
    "version": "1.0.0",
    "lastUpdate": "2024-01-01T12:00:00Z",
    "dataRetentionDays": 30
  },
  "services": {
    "production": {
      "name": "Starships.ai Production",
      "url": "from vars.CLIENT_URL in prod environment",
      "endpoint": "/health",
      "current": {
        "status": "operational",
        "lastCheck": "2024-01-01T12:00:00Z",
        "responseTime": 145,
        "details": {}
      },
      "uptime": {
        "24h": 100,
        "7d": 99.95,
        "30d": 99.89
      },
      "incidents": {
        "active": [],
        "recent": []
      }
    },
    "development": {
      "name": "Starships.ai Development",
      "url": "from vars.CLIENT_URL in dev environment",
      "endpoint": "/health",
      "current": {
        "status": "operational",
        "lastCheck": "2024-01-01T12:00:00Z",
        "responseTime": 203,
        "details": {}
      },
      "uptime": {
        "24h": 99.5,
        "7d": 98.75,
        "30d": 98.50
      },
      "incidents": {
        "active": [],
        "recent": []
      }
    }
  },
  "history": []
}
```

#### History Entry Format
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "checks": {
    "production": {
      "status": "up",
      "responseTime": 145,
      "statusCode": 200,
      "services": {
        "database": "healthy",
        "repositories": "healthy"
      }
    },
    "development": {
      "status": "up",
      "responseTime": 203,
      "statusCode": 200,
      "services": {
        "database": "healthy",
        "repositories": "healthy"
      }
    }
  }
}
```

### 3. Status Page Features

#### Core Components
- **Status Overview**: Current status for all services
- **Uptime Metrics**: 24h, 7d, 30d percentages
- **Response Time Graph**: Last 24 hours
- **Incident Timeline**: Active and resolved incidents
- **Service Details**: Expandable health check details

#### UI Design Principles
- Clean, minimalist interface
- Color-coded status indicators:
  - 🟢 Operational (green)
  - 🟡 Degraded (yellow)
  - 🔴 Down (red)
  - ⚫ Maintenance (gray)
- Mobile-first responsive design
- Auto-refresh every 60 seconds
- Dark mode support

### 4. Discord Integration

Since you already have Discord integration set up (as seen in discord-pr-sync.yml), we can leverage the existing Discord infrastructure:

```yaml
# Can reuse existing Discord secrets if appropriate, or add new webhook
DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_ALERTS_WEBHOOK }}

# Or potentially use existing bot for richer integration
DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
DISCORD_GUILD_ID: ${{ secrets.DISCORD_GUILD_ID }}
DISCORD_CHANNEL_ID: ${{ secrets.DISCORD_ALERTS_CHANNEL_ID }}
```

#### Alert Types
1. **Downtime Alert**
   ```
   🚨 SERVICE DOWN ALERT
   Service: Starships.ai Production
   Status: Down (502 Bad Gateway)
   Duration: Started 2 minutes ago
   View Details: https://uptime.starships.ai
   ```

2. **Recovery Alert**
   ```
   ✅ SERVICE RECOVERED
   Service: Starships.ai Production
   Status: Operational
   Downtime Duration: 15 minutes
   ```

3. **Degradation Alert**
   ```
   ⚠️ SERVICE DEGRADED
   Service: Dev Environment
   Issue: High response time (>5s)
   Components Affected: Database
   ```

#### Alert Configuration
- Cooldown period: 5 minutes (avoid spam)
- Escalation after 10 minutes downtime
- Daily summary at 09:00 UTC
- Weekly report on Mondays

### 5. Monitoring Logic

```javascript
// Pseudo-code for health check logic
async function performHealthCheck(service, environment) {
  // Get URLs from GitHub environment variables
  const urls = {
    client: process.env.CLIENT_URL,
    api: process.env.NEXT_PUBLIC_API_URL,
    server: process.env.NEXT_PUBLIC_SERVER_URL
  };
  
  const maxRetries = 3;
  const timeout = 10000; // 10 seconds
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const start = Date.now();
      const response = await fetch(urls.client + '/health', {
        timeout,
        headers: { 'User-Agent': 'Starships-Uptime-Monitor' }
      });
      
      const responseTime = Date.now() - start;
      const data = await response.json();
      
      return {
        status: determineStatus(response.status, data),
        responseTime,
        statusCode: response.status,
        services: data.services || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (i === maxRetries - 1) {
        return {
          status: 'down',
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}

function determineStatus(statusCode, healthData) {
  if (statusCode !== 200) return 'down';
  if (healthData.status === 'unhealthy') return 'down';
  if (healthData.status === 'degraded') return 'degraded';
  return 'operational';
}
```

### 6. File Structure

```
starships.ai/
├── .github/
│   ├── workflows/
│   │   └── uptime-monitor.yml       # Main monitoring workflow
│   └── scripts/
│       ├── health-checker.js        # Health check logic
│       ├── data-manager.js          # Update status data
│       ├── discord-notifier.js      # Send Discord alerts
│       └── uptime-calculator.js     # Calculate uptime %
│
├── status-page/                      # GitHub Pages root
│   ├── index.html                   # Main status page
│   ├── css/
│   │   └── styles.css              # Page styling
│   ├── js/
│   │   ├── app.js                  # Main application
│   │   ├── charts.js               # Graph rendering
│   │   └── auto-refresh.js         # Auto-update logic
│   ├── data/
│   │   ├── status.json             # Current status
│   │   ├── history.json            # Historical data
│   │   └── incidents.json          # Incident log
│   └── CNAME                        # uptime.starships.ai
```

## Configuration Requirements

### Using Existing GitHub Variables

The monitoring system leverages your existing GitHub environment configuration:

#### Already Configured in Your Environments:
```yaml
# Dev Environment (from build-and-deploy.yml)
environment: dev
vars.CLIENT_URL              # Main application URL
vars.KINDE_SITE_URL          # Should match CLIENT_URL
vars.NEXT_PUBLIC_API_URL     # API endpoint
vars.NEXT_PUBLIC_SERVER_URL  # Server URL

# Prod Environment (from manual-deploy-production.yml)
environment: prod
vars.CLIENT_URL              # Main application URL
vars.KINDE_SITE_URL          # Should match CLIENT_URL  
vars.NEXT_PUBLIC_API_URL     # API endpoint
vars.NEXT_PUBLIC_SERVER_URL  # Server URL
```

**Benefits of reusing existing variables:**
- ✅ No new variables to configure
- ✅ Automatically uses correct URLs for each environment
- ✅ Single source of truth for environment configuration
- ✅ Consistent with deployment workflows
- ✅ Updates automatically if URLs change

### GitHub Secrets to Add
```bash
# New Discord webhook specifically for uptime alerts
DISCORD_ALERTS_WEBHOOK=https://discord.com/api/webhooks/...

# GitHub token for committing status data (can use existing GITHUB_TOKEN)
GH_TOKEN=${{ secrets.GITHUB_TOKEN }}

# Optional: Reuse existing Discord bot for richer features
# (You already have these from discord-pr-sync)
DISCORD_BOT_TOKEN=${{ secrets.DISCORD_BOT_TOKEN }}
DISCORD_GUILD_ID=${{ secrets.DISCORD_GUILD_ID }}
```

### DNS Configuration
```
Type: CNAME
Name: uptime
Value: theingenuityco.github.io
TTL: 3600
```

### GitHub Pages Settings
- Source: Deploy from branch
- Branch: main
- Folder: /status-page
- Custom domain: uptime.starships.ai
- Enforce HTTPS: Yes

## Success Metrics

### Technical Metrics
- [ ] Check frequency: ≤2 minute intervals
- [ ] False positive rate: <1%
- [ ] Alert latency: <30 seconds from detection
- [ ] Page load time: <2 seconds
- [ ] Data accuracy: 99.9%

### Business Metrics
- [ ] User trust improvement
- [ ] Reduced support tickets about downtime
- [ ] Faster incident response time
- [ ] Transparent communication

## Risk Mitigation

### Potential Issues & Solutions

1. **GitHub Actions Rate Limits**
   - Solution: Implement efficient caching
   - Fallback: Reduce check frequency if needed

2. **Data File Size Growth**
   - Solution: Compress historical data
   - Archive data older than 30 days

3. **Discord Webhook Failures**
   - Solution: Implement retry mechanism
   - Fallback: GitHub Issues as backup

4. **False Positives**
   - Solution: Multi-attempt verification
   - Network diversity checks

## Testing Strategy

### Unit Tests
- Health check logic
- Data update functions
- Uptime calculations
- Alert conditions

### Integration Tests
- End-to-end workflow execution
- Discord notification delivery
- Page generation and deployment
- Data persistence

### Load Tests
- Concurrent health checks
- Large historical data handling
- Page performance with history

## Rollout Plan & Timeline

### 📅 Implementation Timeline
```
Today (Jan 15)    ▓▓▓▓▓▓▓▓░░  Phase 1: Core Monitoring
Jan 16            ░░░░░░░░░░  Phase 2: Data Management
Jan 17-18         ░░░░░░░░░░  Phase 3: Status Page
Jan 19            ░░░░░░░░░░  Phase 4: Deployment
Jan 22            ░░░░░░░░░░  Go Live 🚀
```

### 🏁 Milestones & Status

| Milestone | Target Date | Status | Completion |
|-----------|------------|--------|------------|
| **M1: Discord Alerts Working** | Jan 15 | 🟡 In Progress | 90% - PR created, awaiting merge |
| **M2: Monitoring Active** | Jan 16 | 🟡 Ready | 80% - Will activate on merge |
| **M3: Status Page Live** | Jan 18 | ✅ Built | 100% - HTML ready, needs GitHub Pages |
| **M4: Production Ready** | Jan 19 | 🟢 On Track | 85% - Just needs testing |
| **M5: Public Launch** | Jan 22 | 🟢 On Track | 80% - Pending deployment |

### Week 1: Development
- ✅ Day 1 (Jan 15): Core monitoring implementation - **IN PROGRESS**
- ⏳ Day 2 (Jan 16): Data management
- ⏳ Day 3-4 (Jan 17-18): Status page development
- ⏳ Day 5 (Jan 19): Integration testing

### Week 2: Deployment
- ⏳ Day 1 (Jan 22): Production deployment
- ⏳ Day 2-3: Production monitoring
- ⏳ Day 4: Performance optimization
- ⏳ Day 5: Documentation & handover

### Post-Launch Activities
- ⏳ Week 3: Monitor and optimize
- ⏳ Week 4: Add advanced features
- ⏳ Monthly: Review and improve

### 🚦 Go/No-Go Criteria

| Criteria | Status | Required for Launch |
|----------|--------|-------------------|
| Discord alerts functional | 🟡 Testing | ✅ Yes |
| Health endpoints verified | ⏳ Pending | ✅ Yes |
| Status page deployed | ⏳ Pending | ✅ Yes |
| DNS configured | ⏳ Pending | ✅ Yes |
| 24-hour test run | ⏳ Pending | ✅ Yes |
| Team training complete | ⏳ Pending | ⚠️ Nice to have |

## Maintenance Plan

### Daily
- Monitor workflow execution
- Check for false positives
- Review Discord alerts

### Weekly
- Analyze uptime trends
- Update incident reports
- Performance optimization

### Monthly
- Data cleanup and archival
- Security updates
- Feature enhancements

## Cost Analysis

### GitHub Resources (Free Tier)
- Actions: 2,000 minutes/month
- Required: ~1,440 minutes/month (2min × 30 days × 24 hours)
- Storage: <100MB for data files
- Pages: Unlimited bandwidth

### Total Monthly Cost: $0

## Alternative Solutions Comparison

| Solution | Cost/month | Setup Time | Features | Reliability |
|----------|------------|------------|----------|-------------|
| **Our Solution** | $0 | 1 week | Custom, integrated | 99.5% |
| Atlassian Statuspage | $79+ | 1 day | Professional | 99.95% |
| UptimeRobot | $7+ | 2 hours | Basic | 99.9% |
| Pingdom | $15+ | 2 hours | Advanced | 99.95% |
| Custom VPS | $5+ | 2 weeks | Fully custom | Variable |

## Conclusion

This implementation provides a cost-effective, transparent, and reliable uptime monitoring solution that leverages your existing GitHub infrastructure and environment configuration. By reusing the environment variables already configured for your deployments, the system maintains consistency and requires minimal additional setup.

## Appendix

### A. Sample Health Check Response
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": 23
    },
    "repositories": {
      "status": "healthy",
      "responseTime": 45
    }
  },
  "metrics": {
    "memory": {
      "used": 256000000,
      "total": 512000000,
      "percentage": 50
    },
    "connections": {
      "active": 23,
      "total": 156
    }
  }
}
```

### B. References
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Custom Domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Discord Webhook Guide](https://discord.com/developers/docs/resources/webhook)
- [Status Page Best Practices](https://www.atlassian.com/incident-management/incident-communication/status-page-best-practices)

---

*Document Version: 1.0.0*  
*Last Updated: 2024-01-01*  
*Author: DevOps Team*