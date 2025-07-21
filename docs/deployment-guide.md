# Connector Instance Deployment Guide

This guide provides step-by-step instructions for deploying the connector instance architecture to production environments.

## Table of Contents

1. [Overview](#overview)
2. [Pre-deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Deployment Process](#deployment-process)
5. [Post-deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)
8. [Monitoring and Alerting](#monitoring-and-alerting)

## Overview

The connector instance deployment transforms the MCP server architecture from a template-sharing model to an instance-based model, providing:

- **Individual connector instances** per starship
- **Independent status tracking** for each connector
- **Custom configuration** capabilities
- **Better isolation** and management
- **Enhanced scalability** and performance

### Architecture Change

**Before (Template Sharing):**

```
Starship ──HAS_CONNECTOR──> MCPServerOption (Shared Template)
```

**After (Instance-Based):**

```
Starship ──HAS_CONNECTOR_INSTANCE──> MCPServerConnector ──CREATED_FROM──> MCPServerOption
```

## Pre-deployment Checklist

### System Requirements

- [ ] **Node.js**: Version 18.0 or higher
- [ ] **Neo4j**: Version 4.4 or higher
- [ ] **Memory**: Minimum 2GB available RAM
- [ ] **Disk Space**: Minimum 5GB free space
- [ ] **Network**: Stable connection to Neo4j database

### Environment Variables

Ensure the following environment variables are configured:

```bash
# Database Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_secure_password
NEO4J_DATABASE=neo4j

# Application Configuration
NODE_ENV=production
PORT=3000

# Monitoring Configuration (Optional)
ALERT_WEBHOOK_URL=https://your-webhook-url
ALERT_EMAILS=admin@company.com,ops@company.com

# Load Testing Configuration (Optional)
LOAD_TEST_USERS=10
LOAD_TEST_DURATION=60
LOAD_TEST_RAMP_UP=10
```

### Backup Verification

- [ ] **Database Backup**: Verify recent backup exists
- [ ] **Application Code**: Ensure code is committed and tagged
- [ ] **Configuration Files**: Backup current configuration
- [ ] **Rollback Plan**: Confirm rollback procedures are ready

### Team Coordination

- [ ] **Deployment Window**: Schedule maintenance window
- [ ] **Team Notification**: Inform all stakeholders
- [ ] **On-call Engineer**: Ensure coverage during deployment
- [ ] **Communication Channel**: Set up incident response channel

## Environment Setup

### 1. Clone and Setup Repository

```bash
# Clone the repository
git clone https://github.com/your-org/starships.ai.git
cd starships.ai

# Install dependencies
npm install

# Build the application
npm run build
```

### 2. Database Connection Test

```bash
# Test database connectivity
npm run db:test-connection

# Verify database schema
npm run db:verify-schema
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env

# Validate configuration
npm run config:validate
```

## Deployment Process

### Option 1: Automated Deployment (Recommended)

The automated deployment script handles the entire process with built-in validation and rollback capabilities.

#### Staging Deployment

```bash
# Deploy to staging environment
npm run deploy:staging

# Or with custom options
npm run deploy:staging -- --skip-tests --dry-run
```

#### Production Deployment

```bash
# Deploy to production environment
npm run deploy:production

# Or with custom options
npm run deploy:production -- --no-rollback
```

#### Deployment Options

- `--skip-tests`: Skip migration test scenarios
- `--skip-backup`: Skip backup creation (not recommended)
- `--dry-run`: Simulate deployment without making changes
- `--no-rollback`: Disable automatic rollback on failure

### Option 2: Manual Deployment

For environments requiring manual control, follow these steps:

#### Step 1: Pre-deployment Validation

```bash
# Run pre-deployment validation
npm run deployment:validate-pre

# Expected output:
# ✅ Database connectivity: OK
# ✅ Environment configuration: OK
# ✅ System resources: OK
# ✅ Data consistency: OK
```

#### Step 2: Create Pre-deployment Backup

```bash
# Create comprehensive backup
npm run backup:create

# Verify backup integrity
npm run backup:verify <backup-path>
```

#### Step 3: Schema Creation

```bash
# Create database schema and constraints
npm run schema:create

# Verify schema creation
npm run schema:verify
```

#### Step 4: Migration Testing (Optional but Recommended)

```bash
# Run comprehensive migration tests
npm run migration:test

# Run specific test scenario
npm run migration:test -- single-starship
```

#### Step 5: Execute Migration

```bash
# Run the migration
npm run migration:run

# Monitor migration progress
tail -f logs/migration.log
```

#### Step 6: Post-deployment Validation

```bash
# Run comprehensive validation
npm run deployment:validate-post

# Run health checks
npm run deployment:health-check
```

#### Step 7: Performance Validation

```bash
# Run load testing
npm run deployment:load-test

# Check performance metrics
npm run deployment:performance-check
```

## Post-deployment Verification

### 1. System Health Checks

```bash
# Run all health checks
npm run health:check

# Expected output:
# ✅ Database connectivity: OK
# ✅ Repository functionality: OK
# ✅ Data integrity: OK
# ✅ Performance metrics: OK
```

### 2. Data Integrity Verification

```bash
# Validate migration completion
npm run migration:validate

# Check for orphaned data
npm run data:integrity-check

# Verify connector instance operations
npm run connector:test-operations
```

### 3. Performance Validation

```bash
# Run performance benchmarks
npm run performance:benchmark

# Monitor response times
npm run performance:monitor

# Check memory usage
npm run performance:memory-check
```

### 4. User Acceptance Testing

- [ ] **Login Functionality**: Verify user authentication works
- [ ] **Connector Management**: Test creating/updating/deleting connector instances
- [ ] **Starship Operations**: Verify starship-specific connector isolation
- [ ] **Error Handling**: Test error scenarios and recovery
- [ ] **Performance**: Verify acceptable response times

## Rollback Procedures

### Automatic Rollback

If deployment fails and automatic rollback is enabled:

```bash
# Check rollback status
npm run deployment:rollback-status

# Monitor rollback progress
tail -f logs/rollback.log
```

### Manual Rollback

#### Option 1: Migration Rollback

```bash
# Rollback using migration data
npm run migration:rollback

# Or specify rollback data file
npm run migration:rollback -- /path/to/rollback-data.json
```

#### Option 2: Backup Restoration

```bash
# List available backups
npm run backup:list

# Restore from specific backup
npm run backup:restore /path/to/backup.json.gz

# Verify restoration
npm run backup:verify-restore
```

#### Post-rollback Verification

```bash
# Verify system state after rollback
npm run deployment:validate-rollback

# Check data integrity
npm run data:integrity-check

# Restart services
npm run services:restart
```

## Troubleshooting

### Common Issues

#### 1. Migration Timeout

**Symptoms:**

- Migration process hangs or times out
- Database connection errors

**Solutions:**

```bash
# Check database connectivity
npm run db:test-connection

# Increase timeout values
export MIGRATION_TIMEOUT=300000

# Retry migration
npm run migration:retry
```

#### 2. Validation Failures

**Symptoms:**

- Post-migration validation fails
- Data integrity errors

**Solutions:**

```bash
# Run detailed validation
npm run migration:validate --verbose

# Check specific issues
npm run data:check-orphaned
npm run data:check-duplicates

# Fix data issues
npm run data:fix-integrity
```

#### 3. Performance Issues

**Symptoms:**

- Slow query response times
- High memory usage

**Solutions:**

```bash
# Check database indexes
npm run db:check-indexes

# Analyze query performance
npm run db:analyze-queries

# Optimize database
npm run db:optimize
```

#### 4. Health Check Failures

**Symptoms:**

- Health checks fail after deployment
- Service unavailable errors

**Solutions:**

```bash
# Check service status
npm run services:status

# Restart services
npm run services:restart

# Check logs
npm run logs:tail

# Run diagnostic
npm run diagnostic:full
```

### Emergency Procedures

#### Complete System Failure

1. **Immediate Response:**

   ```bash
   # Stop all services
   npm run services:stop

   # Restore from backup
   npm run backup:restore-latest

   # Restart services
   npm run services:start
   ```

2. **Verify Recovery:**

   ```bash
   # Check system health
   npm run health:check

   # Verify data integrity
   npm run data:integrity-check
   ```

3. **Incident Response:**
   - Notify stakeholders
   - Document incident details
   - Schedule post-incident review

## Monitoring and Alerting

### Setup Monitoring

```bash
# Setup comprehensive monitoring
npm run monitoring:setup

# Start monitoring services
npm run monitoring:start

# Access monitoring dashboard
open http://localhost:3001
```

### Key Metrics to Monitor

1. **System Health**
   - API response time
   - Database connectivity
   - Memory usage
   - Error rates

2. **Business Metrics**
   - Connector instance count
   - Active starships
   - Operation success rates
   - User activity

3. **Performance Metrics**
   - Query response times
   - Throughput (operations/second)
   - Resource utilization
   - Cache hit rates

### Alert Configuration

Critical alerts are configured for:

- **Service Down**: API or database unavailable
- **High Error Rate**: >5% error rate for 5 minutes
- **High Response Time**: >1000ms average for 5 minutes
- **Memory Usage**: >80% memory utilization
- **Data Integrity**: Orphaned or duplicate instances detected

### Monitoring Dashboard

Access the monitoring dashboard at: `http://localhost:3001`

**Default Credentials:**

- Username: `admin`
- Password: `admin`

**Key Dashboards:**

- System Overview
- Connector Instance Metrics
- Performance Analytics
- Error Tracking

## Support and Escalation

### Support Contacts

- **Development Team**: dev-team@company.com
- **DevOps Team**: devops@company.com
- **On-call Engineer**: +1-555-ON-CALL

### Escalation Procedures

1. **Level 1**: Development team handles routine issues
2. **Level 2**: DevOps team for infrastructure issues
3. **Level 3**: Senior engineering for critical system failures

### Documentation and Resources

- **API Documentation**: `/docs/api`
- **Architecture Diagrams**: `/docs/architecture`
- **Troubleshooting Guide**: `/docs/troubleshooting`
- **Runbooks**: `/docs/runbooks`

---

## Appendix

### Deployment Checklist

**Pre-deployment:**

- [ ] Environment variables configured
- [ ] Database backup created
- [ ] Team notified
- [ ] Maintenance window scheduled

**During deployment:**

- [ ] Pre-deployment validation passed
- [ ] Schema creation completed
- [ ] Migration executed successfully
- [ ] Post-deployment validation passed

**Post-deployment:**

- [ ] Health checks passing
- [ ] Performance metrics acceptable
- [ ] User acceptance testing completed
- [ ] Monitoring alerts configured

### Command Reference

```bash
# Deployment Commands
npm run deploy:staging
npm run deploy:production
npm run deployment:validate-pre
npm run deployment:validate-post

# Migration Commands
npm run migration:run
npm run migration:rollback
npm run migration:validate
npm run migration:test

# Health and Performance
npm run health:check
npm run performance:benchmark
npm run load:test

# Backup and Recovery
npm run backup:create
npm run backup:restore
npm run backup:list

# Monitoring
npm run monitoring:setup
npm run monitoring:start
npm run monitoring:status
```

### Environment-specific Notes

#### Staging Environment

- Use smaller dataset for testing
- Enable verbose logging
- Run all test scenarios
- Allow longer timeout values

#### Production Environment

- Ensure high availability setup
- Monitor resource usage closely
- Have rollback plan ready
- Coordinate with business stakeholders

---

_This deployment guide is maintained by the Starships.ai development team. For updates or questions, please contact dev-team@company.com._
