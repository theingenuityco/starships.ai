# Disaster Recovery Guide

This guide provides comprehensive procedures for handling various disaster scenarios in the Starships database system.

## Overview

The Starships backup and recovery system provides multiple layers of protection:

1. **Automated Backups**: Created before and after migrations
2. **Manual Backups**: On-demand backup creation
3. **Disaster Recovery**: Automated recovery procedures for various scenarios
4. **Validation**: Comprehensive backup and database validation

## Quick Reference

### Emergency Commands

```bash
# Create immediate backup
npm run backup:create

# Restore from backup
npm run backup:restore /path/to/backup.json

# Validate backup integrity
npm run backup:validate /path/to/backup.json

# Execute disaster recovery
npm run disaster:recovery <scenario> [options]
```

## Disaster Scenarios

### 1. Migration Failure

**Scenario**: Migration process fails or produces unexpected results.

**Symptoms**:

- Migration script exits with errors
- Data inconsistencies after migration
- Missing or corrupted relationships

**Recovery Procedure**:

```bash
# Automatic recovery (recommended)
npm run disaster:recovery migration_failure --rollback-data ./rollback-data.json --backup ./pre-migration-backup.json

# Manual recovery steps:
# 1. Stop all applications using the database
# 2. Attempt migration rollback first
npm run migration:rollback ./rollback-data-timestamp.json

# 3. If rollback fails, restore from pre-migration backup
npm run backup:restore ./pre-migration-backup-timestamp.json

# 4. Validate recovery
npm run backup:validate-database
```

**Prevention**:

- Always run migrations in a test environment first
- Ensure adequate disk space before migration
- Verify database connectivity before starting

### 2. Data Corruption

**Scenario**: Database contains corrupted or inconsistent data.

**Symptoms**:

- Query errors or unexpected results
- Missing relationships or orphaned nodes
- Application errors when accessing data

**Recovery Procedure**:

```bash
# Automatic recovery with latest backup
npm run disaster:recovery data_corruption --auto-find-backup

# Manual recovery:
# 1. Identify latest valid backup
ls -la packages/models/backups/ | grep backup

# 2. Validate backup before restore
npm run backup:validate ./backup-timestamp.json

# 3. Restore from backup
npm run backup:restore ./backup-timestamp.json
```

**Prevention**:

- Regular automated backups
- Database integrity checks
- Proper transaction handling in applications

### 3. Backup Corruption

**Scenario**: Primary backup file is corrupted or unreadable.

**Symptoms**:

- JSON parse errors when loading backup
- Backup validation failures
- File system errors

**Recovery Procedure**:

```bash
# Automatic recovery (finds alternative backups)
npm run disaster:recovery backup_corruption --corrupted-backup ./corrupted-backup.json

# Manual recovery:
# 1. List all available backups
ls -la packages/models/backups/

# 2. Find alternative backup
npm run backup:validate ./alternative-backup.json

# 3. Restore from alternative backup
npm run backup:restore ./alternative-backup.json
```

**Prevention**:

- Multiple backup copies
- Regular backup validation
- Backup file checksums

### 4. Partial Restore

**Scenario**: Database restore was interrupted or incomplete.

**Symptoms**:

- Missing data after restore
- Incomplete relationships
- Application errors due to missing entities

**Recovery Procedure**:

```bash
# Automatic recovery (complete clean restore)
npm run disaster:recovery partial_restore --backup ./backup.json

# Manual recovery:
# 1. Create emergency backup of current state
npm run backup:create ./emergency-backup.json

# 2. Clear database completely
# (This is done automatically by the restore process)

# 3. Perform complete restore
npm run backup:restore ./original-backup.json
```

### 5. Connection Failure

**Scenario**: Cannot connect to Neo4j database.

**Symptoms**:

- Connection timeout errors
- Authentication failures
- Network connectivity issues

**Recovery Procedure**:

```bash
# Automatic recovery with retries
npm run disaster:recovery connection_failure --max-retries 10 --retry-delay 5000

# Manual recovery:
# 1. Check Neo4j service status
systemctl status neo4j

# 2. Verify connection parameters
echo $NEO4J_URI
echo $NEO4J_USERNAME

# 3. Test network connectivity
telnet localhost 7687

# 4. Restart Neo4j service if needed
systemctl restart neo4j
```

**Prevention**:

- Monitor Neo4j service health
- Implement connection pooling
- Use connection retry logic in applications

### 6. Disk Space Exhaustion

**Scenario**: Insufficient disk space for operations.

**Symptoms**:

- Backup creation failures
- Database write errors
- System performance issues

**Recovery Procedure**:

```bash
# Automatic cleanup of old backups
npm run disaster:recovery disk_space_exhaustion --cleanup-old-backups --max-backups-to-keep 5

# Manual recovery:
# 1. Check disk usage
df -h

# 2. Clean up old backups
find packages/models/backups/ -name "*.json" -mtime +30 -delete

# 3. Clean up log files
find . -name "*.log" -mtime +7 -delete

# 4. Verify available space
df -h
```

## Backup Management

### Creating Backups

```bash
# Create backup with auto-generated name
npm run backup:create

# Create backup with specific name
npm run backup:create ./my-backup.json

# Create backup in specific directory
npm run backup:create /path/to/backups/backup.json
```

### Validating Backups

```bash
# Validate specific backup
npm run backup:validate ./backup.json

# Validate all backups in directory
for backup in packages/models/backups/*.json; do
  npm run backup:validate "$backup"
done
```

### Restoring Backups

```bash
# Restore from specific backup
npm run backup:restore ./backup.json

# List available backups
ls -la packages/models/backups/
```

## Backup File Structure

Backup files contain the following data:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "metadata": {
    "createdBy": "BackupManager",
    "description": "Comprehensive database backup",
    "totalEntities": 1250,
    "databaseVersion": "neo4j-5.x"
  },
  "starships": [...],
  "mcpServerOptions": [...],
  "agents": [...],
  "users": [...],
  "codexes": [...],
  "visions": [...],
  "constraints": [...],
  "concepts": [...],
  "metaAnchors": [...],
  "hasConnectorRelationships": [...],
  "connectorInstances": [...],
  "relationships": {
    "ownsRelationships": [...],
    "deployedOnRelationships": [...],
    "hasActiveCodexRelationships": [...],
    "containsRelationships": [...],
    "anchoredByRelationships": [...]
  }
}
```

## Best Practices

### Backup Strategy

1. **Automated Backups**:
   - Before every migration
   - After successful migrations
   - Daily scheduled backups

2. **Backup Retention**:
   - Keep last 10 daily backups
   - Keep last 4 weekly backups
   - Keep last 12 monthly backups

3. **Backup Validation**:
   - Validate backups immediately after creation
   - Regular validation of stored backups
   - Test restore procedures monthly

### Recovery Planning

1. **Documentation**:
   - Keep this guide updated
   - Document custom recovery procedures
   - Maintain contact information for support

2. **Testing**:
   - Test recovery procedures in development
   - Simulate disaster scenarios
   - Validate recovery time objectives

3. **Monitoring**:
   - Monitor backup creation success
   - Alert on backup failures
   - Track backup file sizes and growth

## Environment Variables

Configure the following environment variables:

```bash
# Neo4j Connection
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-[DEFAULT-PASSWORD]
NEO4J_DATABASE=neo4j

# Backup Configuration
BACKUP_DIRECTORY=./packages/models/backups
BACKUP_RETENTION_DAYS=30
MAX_BACKUP_FILES=10
```

## Troubleshooting

### Common Issues

1. **Backup Creation Fails**:
   - Check disk space
   - Verify database connectivity
   - Check file permissions

2. **Restore Fails**:
   - Validate backup file first
   - Check database is accessible
   - Ensure sufficient disk space

3. **Validation Errors**:
   - Check backup file integrity
   - Verify JSON format
   - Look for missing required fields

### Log Files

Check the following logs for troubleshooting:

- Application logs: `./logs/application.log`
- Neo4j logs: `/var/log/neo4j/`
- System logs: `/var/log/syslog`

### Support Contacts

- **Database Administrator**: [contact-info]
- **Development Team**: [contact-info]
- **Infrastructure Team**: [contact-info]

## Recovery Time Objectives

| Scenario           | Target Recovery Time | Maximum Data Loss |
| ------------------ | -------------------- | ----------------- |
| Migration Failure  | < 15 minutes         | None (rollback)   |
| Data Corruption    | < 30 minutes         | < 1 hour          |
| Backup Corruption  | < 45 minutes         | < 24 hours        |
| Partial Restore    | < 20 minutes         | None              |
| Connection Failure | < 5 minutes          | None              |
| Disk Space Issues  | < 10 minutes         | None              |

## Compliance and Auditing

### Backup Auditing

- All backup operations are logged
- Backup file integrity is tracked
- Recovery operations are documented

### Data Protection

- Backups contain sensitive data
- Secure backup storage required
- Access controls must be maintained

### Retention Policies

- Follow organizational data retention policies
- Secure deletion of expired backups
- Compliance with regulatory requirements

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
**Maintained By**: Starships Development Team
