# Connector Instance Deployment Package

This package provides comprehensive deployment, migration, and monitoring tools for the connector instance architecture transformation.

## Overview

The connector instance deployment package includes:

- **Automated deployment scripts** with validation and rollback
- **Database migration utilities** with comprehensive testing
- **Production health checks** and monitoring setup
- **Load testing and performance validation**
- **Comprehensive reporting and alerting**

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Ensure environment variables are set
cp ../.env.example ../.env
# Edit .env with your configuration
```

### Basic Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production (with confirmation)
npm run deploy:production
```

### Dry Run (Recommended First)

```bash
# Test deployment without making changes
npm run deploy:staging:dry-run
npm run deploy:production:dry-run
```

## Available Commands

### Deployment Commands

| Command                                | Description                                |
| -------------------------------------- | ------------------------------------------ |
| `npm run deploy:staging`               | Full deployment to staging environment     |
| `npm run deploy:production`            | Full deployment to production environment  |
| `npm run deploy:staging:dry-run`       | Simulate staging deployment                |
| `npm run deploy:production:dry-run`    | Simulate production deployment             |
| `npm run deploy:staging:skip-tests`    | Deploy to staging without running tests    |
| `npm run deploy:production:skip-tests` | Deploy to production without running tests |

### Validation Commands

| Command                      | Description                    |
| ---------------------------- | ------------------------------ |
| `npm run validate:pre`       | Run pre-deployment validation  |
| `npm run validate:post`      | Run post-deployment validation |
| `npm run migration:validate` | Validate migration completion  |
| `npm run schema:validate`    | Validate database schema       |

### Health and Performance

| Command                   | Description                          |
| ------------------------- | ------------------------------------ |
| `npm run health:check`    | Run comprehensive health checks      |
| `npm run health:quick`    | Run quick health check               |
| `npm run load:test`       | Run standard load test               |
| `npm run load:test:light` | Run light load test (5 users, 30s)   |
| `npm run load:test:heavy` | Run heavy load test (50 users, 5min) |

### Migration Commands

| Command                      | Description                              |
| ---------------------------- | ---------------------------------------- |
| `npm run migration:run`      | Execute the connector instance migration |
| `npm run migration:rollback` | Rollback the migration                   |
| `npm run migration:test`     | Run migration test scenarios             |
| `npm run schema:create`      | Create database schema and constraints   |

### Backup and Recovery

| Command                  | Description            |
| ------------------------ | ---------------------- |
| `npm run backup:create`  | Create database backup |
| `npm run backup:restore` | Restore from backup    |
| `npm run backup:list`    | List available backups |

### Monitoring

| Command                     | Description                     |
| --------------------------- | ------------------------------- |
| `npm run monitoring:setup`  | Setup monitoring infrastructure |
| `npm run monitoring:start`  | Start monitoring services       |
| `npm run monitoring:stop`   | Stop monitoring services        |
| `npm run monitoring:status` | Check monitoring service status |

### Maintenance

| Command                   | Description                       |
| ------------------------- | --------------------------------- |
| `npm run cleanup:backups` | Remove backups older than 30 days |
| `npm run cleanup:logs`    | Remove logs older than 7 days     |
| `npm run cleanup:reports` | Remove reports older than 30 days |

## Configuration

### Environment Variables

```bash
# Database Configuration
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_[DEFAULT-PASSWORD]
NEO4J_DATABASE=neo4j

# Deployment Configuration
NODE_ENV=production
DEPLOYMENT_TIMEOUT=300000

# Load Testing Configuration
LOAD_TEST_USERS=10
LOAD_TEST_DURATION=60
LOAD_TEST_RAMP_UP=10

# Monitoring Configuration
ALERT_WEBHOOK_URL=https://your-webhook-url
ALERT_EMAILS=admin@company.com,ops@company.com
```

### Deployment Options

The deployment scripts accept various command-line options:

```bash
# Skip migration tests (faster deployment)
npm run deploy:staging -- --skip-tests

# Skip backup creation (not recommended for production)
npm run deploy:staging -- --skip-backup

# Dry run mode (simulate without changes)
npm run deploy:staging -- --dry-run

# Disable automatic rollback on failure
npm run deploy:production -- --no-rollback
```

## Deployment Process

### Automated Deployment Flow

1. **Pre-deployment Validation**
   - Database connectivity check
   - Environment configuration validation
   - System resource verification
   - Data consistency checks

2. **Schema Creation**
   - Create database constraints
   - Create performance indexes
   - Validate schema integrity

3. **Migration Testing** (unless skipped)
   - Empty database migration test
   - Single starship migration test
   - Large dataset migration test
   - Concurrent access test
   - Rollback test

4. **Migration Execution**
   - Create pre-migration backup
   - Transform data structure
   - Validate migration results

5. **Post-deployment Validation**
   - Data integrity verification
   - Relationship consistency checks
   - Performance validation

6. **Health Checks**
   - System functionality tests
   - Performance metrics collection
   - Error rate monitoring

7. **Finalization**
   - Create post-deployment backup
   - Generate deployment report
   - Setup monitoring alerts

### Manual Deployment Steps

For environments requiring manual control:

```bash
# 1. Pre-deployment validation
npm run validate:pre

# 2. Create backup
npm run backup:create

# 3. Create schema
npm run schema:create

# 4. Test migration (optional)
npm run migration:test

# 5. Run migration
npm run migration:run

# 6. Validate results
npm run validate:post

# 7. Run health checks
npm run health:check

# 8. Setup monitoring
npm run monitoring:setup
```

## Monitoring and Alerting

### Setup Monitoring

```bash
# Setup comprehensive monitoring stack
npm run monitoring:setup

# Start monitoring services
npm run monitoring:start

# Check service status
npm run monitoring:status
```

### Monitoring Dashboard

After setup, access the monitoring dashboard at:

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### Key Metrics

The monitoring system tracks:

- **System Health**: API status, database connectivity
- **Performance**: Response times, throughput, memory usage
- **Business Metrics**: Connector instance count, active starships
- **Error Rates**: HTTP errors, database errors, validation failures

### Alerts

Critical alerts are configured for:

- Service downtime
- High error rates (>5%)
- Slow response times (>1000ms)
- High memory usage (>80%)
- Data integrity issues

## Troubleshooting

### Common Issues

#### Deployment Fails During Migration

```bash
# Check migration logs
tail -f ../logs/migration.log

# Validate pre-migration state
npm run validate:pre

# Check database connectivity
npm run health:check

# Retry with verbose logging
DEBUG=* npm run migration:run
```

#### Health Checks Fail

```bash
# Run detailed health check
npm run health:check

# Check specific components
npm run validate:post

# Restart services if needed
npm run monitoring:stop
npm run monitoring:start
```

#### Performance Issues

```bash
# Run performance benchmark
npm run load:test:light

# Check database indexes
npm run schema:validate

# Monitor system resources
npm run monitoring:status
```

### Emergency Rollback

```bash
# Automatic rollback (if deployment failed)
npm run migration:rollback

# Manual rollback from backup
npm run backup:list
npm run backup:restore /path/to/backup.json.gz

# Verify rollback
npm run validate:post
```

## Development

### Adding New Deployment Steps

1. Create new script in `scripts/` directory
2. Add command to `package.json`
3. Update deployment flow in `connector-instance-deployment.ts`
4. Add tests and documentation

### Testing Deployment Scripts

```bash
# Test individual components
npm run validate:pre
npm run health:check
npm run load:test:light

# Test full deployment in dry-run mode
npm run deploy:staging:dry-run
```

## Support

### Documentation

- [Deployment Guide](../docs/deployment-guide.md)
- [Architecture Diagram](../docs/connector-instance-architecture-diagram.md)
- [Implementation Plan](../docs/connector-instance-implementation-plan.md)

### Support Contacts

- **Development Team**: dev-team@company.com
- **DevOps Team**: devops@company.com
- **On-call Engineer**: +1-555-ON-CALL

### Reporting Issues

When reporting deployment issues, include:

1. **Environment**: staging/production
2. **Command executed**: exact command that failed
3. **Error logs**: relevant log excerpts
4. **System state**: output of health checks
5. **Timeline**: when the issue occurred

## License

MIT License - see LICENSE file for details.

---

_This deployment package is maintained by the Starships.ai development team._
