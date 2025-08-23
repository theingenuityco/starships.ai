# Starship Schema Migration Script

## Overview

This migration script updates existing database records to work with the new simplified Starship and Agent schema. It's critical for fixing the vision context loading issue that occurs when `starshipRepo.findByOwner(userId)` returns no results.

## What This Migration Does

### 1. Starship Entity Updates

**Removes deprecated fields:**
- `powerLevel` - No longer used in simplified schema
- `sibilInsights` - Replaced with direct Vision entities  
- `activeExpeditions` - No longer used
- `maxActiveExpeditions` - Replaced with `maxAgents`

**Adds new fields:**
- `maxAgents` with default values:
  - Scout class: `maxAgents: 3`
  - Cruiser class: `maxAgents: 5`
  - Draught class: `maxAgents: 10`

**Updates status values:**
- `'docked'` → `'inactive'`
- `'maintenance'` → `'inactive'`
- `'active'` → `'active'` (no change)

### 2. Agent Entity Updates

**Populates starshipId foreign key:**
- Finds all existing `DEPLOYED_ON` relationships between Agent and Starship nodes
- Populates `starshipId` field on Agent nodes based on these relationships
- Maintains `DEPLOYED_ON` relationships during transition for backward compatibility
- Handles edge cases where agents might not be deployed to any starship

## Usage

### Available Commands

```bash
# Run the migration (WARNING: This makes actual database changes)
npm run migrate:starship-schema --workspace=@starships/models

# Preview changes without making modifications (SAFE)
npm run migrate:starship-schema:dry-run --workspace=@starships/models

# Rollback migration (LIMITED FUNCTIONALITY)
npm run migrate:starship-schema:rollback --workspace=@starships/models
```

### Command Line Options

- `--dry-run` or `-d`: Preview changes without making database modifications
- `--rollback` or `-r`: Attempt to rollback changes (limited functionality)
- `--batch-size N`: Process records in batches of N (default: 100)

### Example Output

```
🚀 [SCHEMA-MIGRATION] Starting starship schema migration...
🔍 [SCHEMA-MIGRATION] Running in DRY RUN mode - no changes will be made
📊 [SCHEMA-MIGRATION] Skipping database validation in dry-run mode
🛸 [SCHEMA-MIGRATION] Step 1: Migrating starship entities...
📄 [DRY RUN] Would remove deprecated fields from 10 starships
📄 [DRY RUN] Would add maxAgents to 8 starships
📄 [DRY RUN] Would update status for 5 starships
👨‍🚀 [SCHEMA-MIGRATION] Step 2: Migrating agent entities...
📄 [DRY RUN] Would populate starshipId for 12 agents
📄 [DRY RUN] Found 2 undeployed agents

======================================================================
📊 [SCHEMA-MIGRATION] MIGRATION REPORT
======================================================================

🛸 STARSHIP UPDATES:
  ✅ Deprecated fields removed: 10
  ➕ MaxAgents added: 8
  🔄 Status values updated: 5
  ❌ Failures: 0

👨‍🚀 AGENT UPDATES:
  🔗 StarshipId populated: 12
  ⚠️  Undeployed agents found: 2
  ❌ Failures: 0

📈 [SCHEMA-MIGRATION] Overall Success Rate: 100.0%
🎉 [SCHEMA-MIGRATION] Migration completed successfully!
======================================================================
```

## Safety Features

### 1. Dry Run Mode (Recommended First Step)
Always run with `--dry-run` first to see what changes will be made:
```bash
npm run migrate:starship-schema:dry-run --workspace=@starships/models
```

### 2. Comprehensive Logging
- Every operation is logged with clear status indicators
- Detailed progress reporting for large datasets
- Error handling with specific failure reasons
- Success/failure counts for each migration step

### 3. Data Validation
- Pre-migration validation to assess current state
- Post-migration validation to ensure integrity
- Validation queries to verify:
  - All starships have `maxAgents`
  - All starships have valid status values
  - All deployed agents have `starshipId`
  - `starshipId` matches `DEPLOYED_ON` relationships

### 4. Error Handling
- Continues processing even if individual records fail
- Collects and reports all errors at the end
- Safe handling of edge cases and data inconsistencies
- Graceful degradation for missing or invalid data

## Neo4j Queries Used

### Starship Migrations

```cypher
-- Remove deprecated fields
MATCH (s:Starship)
WHERE s.powerLevel IS NOT NULL OR s.sibilInsights IS NOT NULL OR s.activeExpeditions IS NOT NULL
REMOVE s.powerLevel, s.sibilInsights, s.activeExpeditions
RETURN count(s) as count

-- Add maxAgents for Scout class
MATCH (s:Starship {class: 'scout'})
WHERE s.maxAgents IS NULL
SET s.maxAgents = 3, s.updatedAt = $timestamp
RETURN count(s) as count

-- Add maxAgents for Cruiser class  
MATCH (s:Starship {class: 'cruiser'})
WHERE s.maxAgents IS NULL
SET s.maxAgents = 5, s.updatedAt = $timestamp
RETURN count(s) as count

-- Add maxAgents for Draught class  
MATCH (s:Starship {class: 'draught'})
WHERE s.maxAgents IS NULL
SET s.maxAgents = 10, s.updatedAt = $timestamp
RETURN count(s) as count

-- Update status values
MATCH (s:Starship)
WHERE s.status IN ['docked', 'maintenance']
SET s.status = 'inactive', s.updatedAt = $timestamp
RETURN count(s) as count
```

### Agent Migrations

```cypher
-- Populate starshipId from DEPLOYED_ON relationships
MATCH (a:Agent)-[r:DEPLOYED_ON]->(s:Starship)
WHERE a.starshipId IS NULL OR a.starshipId = ""
SET a.starshipId = s.id, a.updatedAt = $timestamp
RETURN count(a) as count

-- Find undeployed agents
MATCH (a:Agent)
WHERE NOT EXISTS((a)-[:DEPLOYED_ON]->(:Starship)) AND (a.starshipId IS NULL OR a.starshipId = "")
RETURN count(a) as count
```

### Validation Queries

```cypher
-- Check starships missing maxAgents
MATCH (s:Starship) WHERE s.maxAgents IS NULL RETURN count(s) as count

-- Check starships with invalid status
MATCH (s:Starship) WHERE NOT s.status IN ['active', 'inactive'] OR s.status IS NULL RETURN count(s) as count

-- Check agents missing starshipId  
MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship)
WHERE a.starshipId IS NULL OR a.starshipId = ""
RETURN count(a) as count

-- Check starshipId mismatch
MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship)
WHERE a.starshipId IS NOT NULL AND a.starshipId <> s.id
RETURN count(a) as count
```

## Prerequisites

1. **Database Connection**: Ensure Neo4j is running and accessible
2. **Environment Variables**: Set up connection credentials:
   ```
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USERNAME=neo4j  
   NEO4J_PASSWORD=your_password
   ```
3. **Backup**: Create a database backup before running the migration
4. **Dependencies**: Ensure all npm dependencies are installed

## Troubleshooting

### Connection Issues
```
Error: Neo4j connection not initialized
```
- Verify Neo4j is running
- Check environment variables
- Test connection with `neo4j-driver` directly

### Migration Failures
- Check the detailed error logs in the migration report
- Verify data integrity with validation queries
- Consider running smaller batches with `--batch-size`

### Rollback Limitations
The rollback functionality is limited because:
- Original status values aren't preserved during migration
- Some changes are destructive (field removal)
- **Recommendation**: Restore from database backup for complete rollback

## Integration with Vision Context Loading

This migration specifically fixes the issue where:
1. `starshipRepo.findByOwner(userId)` returns no results
2. Vision context loading fails with `hasVisionContext: false`
3. `visionContextLength: 0` appears in the system

After migration:
- All agents have proper `starshipId` foreign key relationships
- All starships have clean, simplified schema
- Vision context loading can successfully find starships and their agents
- Repository methods work correctly with the new schema

## Files Modified

- [`migrate-starship-schema.ts`](./migrate-starship-schema.ts) - Main migration script
- [`package.json`](../../package.json) - Added migration scripts  
- [`StarshipRepository.ts`](../repositories/StarshipRepository.ts) - Updated for new schema
- [`AgentRepository.ts`](../repositories/AgentRepository.ts) - Updated for new schema

## Exit Codes

- `0`: Success - all migrations completed successfully
- `1`: Validation issues - migration completed but validation found problems  
- `2`: Migration failures - some operations failed
- `3`: Critical failure - migration could not proceed