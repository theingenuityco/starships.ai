# Migration Validation System

This guide explains how to use the comprehensive validation system for the connector instance migration.

## Overview

The validation system ensures data integrity after migrating from the old template-sharing model to the new instance-based model. It performs comprehensive checks to verify that all data has been properly transformed without loss or corruption.

## Features

- **Comprehensive Validation Checks**: 6 different validation checks covering all aspects of the migration
- **Statistics Gathering**: Detailed statistics about the migration state
- **Report Generation**: Comprehensive reports with recommendations
- **Monitoring Queries**: Pre-built queries for ongoing system monitoring
- **CLI Interface**: Easy-to-use command-line interface
- **Integration**: Seamlessly integrated with the migration workflow

## Validation Checks

### 1. No Orphaned Connector Instances

Ensures all `MCPServerConnector` nodes have proper relationships to both starships and templates.

### 2. No Duplicate Instances

Verifies uniqueness constraints are working and no duplicate connector instances exist.

### 3. Valid Connector Instances

Checks that `starshipId` and `templateId` properties match the actual relationships.

### 4. No Old HAS_CONNECTOR Relationships

Confirms that all old-style relationships have been completely migrated.

### 5. Relationship Integrity

Validates that all relationships have proper timestamps and metadata.

### 6. Data Consistency

Ensures all required fields are present and data is logically consistent.

## Usage

### Quick Validation

```bash
# Run basic validation
npm run validate-migration

# From the migration script
npm run migrate  # Validation is automatically run after migration
```

### Comprehensive Report

```bash
# Generate detailed report
npm run validate-migration:report

# Generate and save report with verbose output
npm run validate-migration:full
```

### Programmatic Usage

```typescript
import { MigrationValidator } from './validate-migration';

const validator = new MigrationValidator();

// Basic validation
const result = await validator.validateMigration();
console.log('Valid:', result.valid);
console.log('Errors:', result.errors);
console.log('Statistics:', result.statistics);

// Generate comprehensive report
const report = await validator.generateReport();
console.log('Report:', report);

// Save report to file
const reportPath = await validator.saveReport(report);
console.log('Report saved to:', reportPath);
```

## Validation Result Structure

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalConnectorInstances: number;
    totalStarships: number;
    totalTemplates: number;
    orphanedInstances: number;
    duplicateInstances: number;
  };
}
```

## Report Structure

```typescript
interface ValidationReport {
  timestamp: string;
  migrationVersion: string;
  result: ValidationResult;
  executionTime: number;
  recommendations: string[];
  monitoringQueries: {
    name: string;
    query: string;
    description: string;
  }[];
}
```

## Monitoring Queries

The system provides 5 pre-built monitoring queries:

1. **Orphaned Connector Instances**: Monitor for instances without proper relationships
2. **Duplicate Connector Instances**: Monitor for duplicate instances
3. **Old HAS_CONNECTOR Relationships**: Monitor for remaining old-style relationships
4. **Connector Instance Health**: Monitor overall health of connector instances
5. **Migration Completeness**: Monitor migration completeness and system state

## Integration with Migration

The validation system is automatically integrated with the migration workflow:

1. **Pre-migration validation** ensures the database is in a valid state before migration
2. **Post-migration validation** uses the comprehensive validator to ensure migration success
3. **Automatic rollback** if validation fails
4. **Report generation** for audit trails

## Error Handling

The validation system handles errors gracefully:

- **Database connection errors** are caught and reported
- **Query failures** don't crash the validation process
- **Partial failures** are reported with detailed error messages
- **Recovery recommendations** are provided based on the type of errors found

## Best Practices

1. **Always run validation** after migration
2. **Save reports** for audit trails
3. **Monitor regularly** using the provided monitoring queries
4. **Address warnings** even if validation passes
5. **Keep rollback data** until validation confirms success

## Troubleshooting

### Common Issues

1. **Orphaned Instances**: Usually indicates incomplete migration or data corruption
   - **Solution**: Re-run migration or clean up orphaned instances manually

2. **Duplicate Instances**: Indicates uniqueness constraint failures
   - **Solution**: Remove duplicates and ensure constraints are properly configured

3. **Old Relationships**: Indicates incomplete migration
   - **Solution**: Complete the migration process or investigate why some relationships weren't migrated

4. **Data Inconsistencies**: Indicates data corruption or migration bugs
   - **Solution**: Investigate the root cause and fix data manually or re-run migration

### Getting Help

If validation fails:

1. Check the error messages for specific issues
2. Review the recommendations in the report
3. Use the monitoring queries to investigate further
4. Consider rolling back if critical issues are found
5. Fix the underlying issues and re-run the migration

## Files

- `validate-migration.ts`: Main validation system implementation
- `001-connector-instances.ts`: Migration script with integrated validation
- `validate-migration.ts` (script): Standalone CLI script
- `VALIDATION_GUIDE.md`: This documentation file

## CLI Commands

```bash
# Basic validation
npm run validate-migration

# Generate report
npm run validate-migration:report

# Full validation with report and save
npm run validate-migration:full

# Run migration (includes validation)
npm run migrate
```
