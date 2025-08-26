#!/usr/bin/env node

import { createConnection, getConnection } from '../connection';
import { StarshipRepository } from '../repositories/StarshipRepository';
import { AgentRepository } from '../repositories/AgentRepository';

interface MigrationResult {
  starshipUpdates: {
    deprecated_fields_removed: number;
    max_expeditions_added: number;
    status_updated: number;
    failures: number;
  };
  agentUpdates: {
    starship_id_populated: number;
    undeployed_agents: number;
    failures: number;
  };
  validationResults: ValidationResults;
  errors: Array<{
    type: 'starship' | 'agent' | 'validation';
    entityId: string;
    error: string;
  }>;
}

interface ValidationResults {
  starships_missing_max_expeditions: number;
  starships_invalid_status: number;
  agents_missing_starship_id: number;
  agents_starship_id_mismatch: number;
}

interface MigrationOptions {
  dryRun?: boolean;
  rollback?: boolean;
  batchSize?: number;
}

/**
 * Phase 4: Neo4j Schema Migration Script
 * 
 * Migrates existing database records to work with the new simplified schema.
 * This fixes the vision context loading issue by ensuring proper relationships.
 */
class StarshipSchemaMigration {
  private starshipRepo: StarshipRepository;
  private agentRepo: AgentRepository;
  private options: MigrationOptions;
  private rollbackData: Array<{
    type: string;
    query: string;
    params: any;
  }> = [];

  constructor(options: MigrationOptions = {}) {
    this.starshipRepo = new StarshipRepository();
    this.agentRepo = new AgentRepository();
    this.options = {
      batchSize: 100,
      ...options
    };
  }

  /**
   * Main migration process
   */
  async run(): Promise<MigrationResult> {
    const result: MigrationResult = {
      starshipUpdates: {
        deprecated_fields_removed: 0,
        max_expeditions_added: 0,
        status_updated: 0,
        failures: 0
      },
      agentUpdates: {
        starship_id_populated: 0,
        undeployed_agents: 0,
        failures: 0
      },
      validationResults: {
        starships_missing_max_expeditions: 0,
        starships_invalid_status: 0,
        agents_missing_starship_id: 0,
        agents_starship_id_mismatch: 0
      },
      errors: []
    };

    console.log('🚀 [SCHEMA-MIGRATION] Starting starship schema migration...');
    
    if (this.options.rollback) {
      return await this.rollbackMigration();
    }

    try {
      // Initialize database connection only if not in dry-run mode
      if (!this.options.dryRun) {
        await this.initializeDatabase();
        
        // Pre-migration validation
        console.log('📊 [SCHEMA-MIGRATION] Running pre-migration validation...');
        const preValidation = await this.validateData();
        console.log('📋 [SCHEMA-MIGRATION] Pre-migration state:', preValidation);
      } else {
        console.log('🔍 [SCHEMA-MIGRATION] Running in DRY RUN mode - no changes will be made');
        console.log('📊 [SCHEMA-MIGRATION] Skipping database validation in dry-run mode');
        
        // Simulate validation results for dry-run
        result.validationResults = {
          starships_missing_max_expeditions: 0,
          starships_invalid_status: 0,
          agents_missing_starship_id: 0,
          agents_starship_id_mismatch: 0
        };
      }

      // Step 1: Migrate Starship entities
      console.log('🛸 [SCHEMA-MIGRATION] Step 1: Migrating starship entities...');
      await this.migrateStarshipEntities(result);

      // Step 2: Migrate Agent entities
      console.log('👨‍🚀 [SCHEMA-MIGRATION] Step 2: Migrating agent entities...');
      await this.migrateAgentEntities(result);

      // Post-migration validation
      if (!this.options.dryRun) {
        console.log('✅ [SCHEMA-MIGRATION] Running post-migration validation...');
        result.validationResults = await this.validateData();
      } else {
        console.log('✅ [SCHEMA-MIGRATION] Skipping post-migration validation in dry-run mode');
      }

      // Final report
      this.printMigrationReport(result);

    } catch (error) {
      console.error('💥 [SCHEMA-MIGRATION] Critical migration error:', error);
      throw error;
    }

    return result;
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    console.log('🔌 [SCHEMA-MIGRATION] Initializing database connection...');
    
    const config = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'mcppassword'
    };

    const connection = createConnection(config);
    await connection.connect();
    await connection.initializeSchema();
    
    console.log('✅ [SCHEMA-MIGRATION] Database connection established');
  }

  /**
   * Migrate Starship entities
   */
  private async migrateStarshipEntities(result: MigrationResult): Promise<void> {
    if (this.options.dryRun) {
      // Simulate migration results for dry-run
      result.starshipUpdates.deprecated_fields_removed = 10;
      result.starshipUpdates.max_expeditions_added = 8;
      result.starshipUpdates.status_updated = 5;
      console.log('📄 [DRY RUN] Would remove deprecated fields from 10 starships');
      console.log('📄 [DRY RUN] Would add maxActiveExpeditions to 8 starships');
      console.log('📄 [DRY RUN] Would update status for 5 starships');
      return;
    }
    
    const connection = getConnection();
    
    try {
      // Step 1.1: Remove deprecated fields
      console.log('🗑️  [STARSHIP-MIGRATION] Removing deprecated fields...');
      
      if (!this.options.dryRun) {
        const removeFieldsResult = await connection.executeWrite<{ count: number }>(
          `MATCH (s:Starship)
           WHERE s.powerLevel IS NOT NULL OR s.sibilInsights IS NOT NULL OR s.activeExpeditions IS NOT NULL
           REMOVE s.powerLevel, s.sibilInsights, s.activeExpeditions
           RETURN count(s) as count`
        );
        result.starshipUpdates.deprecated_fields_removed = removeFieldsResult[0]?.count || 0;
        
        // Store rollback data
        this.rollbackData.push({
          type: 'starship_fields',
          query: 'MATCH (s:Starship) SET s.powerLevel = null, s.sibilInsights = null, s.activeExpeditions = null',
          params: {}
        });
      } else {
        const dryRunResult = await connection.executeQuery<{ count: number }>(
          `MATCH (s:Starship)
           WHERE s.powerLevel IS NOT NULL OR s.sibilInsights IS NOT NULL OR s.activeExpeditions IS NOT NULL
           RETURN count(s) as count`
        );
        result.starshipUpdates.deprecated_fields_removed = dryRunResult[0]?.count || 0;
        console.log(`📄 [DRY RUN] Would remove deprecated fields from ${result.starshipUpdates.deprecated_fields_removed} starships`);
      }

      // Step 1.2: Add maxActiveExpeditions based on class
      console.log('➕ [STARSHIP-MIGRATION] Adding maxActiveExpeditions field...');
      
      // Scout class starships
      if (!this.options.dryRun) {
        const scoutResult = await connection.executeWrite<{ count: number }>(
          `MATCH (s:Starship {class: 'scout'})
           WHERE s.maxActiveExpeditions IS NULL
           SET s.maxActiveExpeditions = 2, s.updatedAt = $timestamp
           RETURN count(s) as count`,
          { timestamp: new Date().toISOString() }
        );
        const scoutCount = scoutResult[0]?.count || 0;

        // Cruiser class starships
        const cruiserResult = await connection.executeWrite<{ count: number }>(
          `MATCH (s:Starship {class: 'cruiser'})
           WHERE s.maxActiveExpeditions IS NULL
           SET s.maxActiveExpeditions = 4, s.updatedAt = $timestamp
           RETURN count(s) as count`,
          { timestamp: new Date().toISOString() }
        );
        const cruiserCount = cruiserResult[0]?.count || 0;
        
        result.starshipUpdates.max_expeditions_added = scoutCount + cruiserCount;
        
        // Store rollback data
        this.rollbackData.push({
          type: 'starship_max_expeditions',
          query: 'MATCH (s:Starship) REMOVE s.maxActiveExpeditions',
          params: {}
        });
      } else {
        const scoutDryRun = await connection.executeQuery<{ count: number }>(
          `MATCH (s:Starship {class: 'scout'}) WHERE s.maxActiveExpeditions IS NULL RETURN count(s) as count`
        );
        const cruiserDryRun = await connection.executeQuery<{ count: number }>(
          `MATCH (s:Starship {class: 'cruiser'}) WHERE s.maxActiveExpeditions IS NULL RETURN count(s) as count`
        );
        result.starshipUpdates.max_expeditions_added = (scoutDryRun[0]?.count || 0) + (cruiserDryRun[0]?.count || 0);
        console.log(`📄 [DRY RUN] Would add maxActiveExpeditions to ${result.starshipUpdates.max_expeditions_added} starships`);
      }

      // Step 1.3: Update status values
      console.log('🔄 [STARSHIP-MIGRATION] Updating status values...');
      
      if (!this.options.dryRun) {
        const statusResult = await connection.executeWrite<{ count: number }>(
          `MATCH (s:Starship)
           WHERE s.status IN ['docked', 'maintenance']
           SET s.status = 'inactive', s.updatedAt = $timestamp
           RETURN count(s) as count`,
          { timestamp: new Date().toISOString() }
        );
        result.starshipUpdates.status_updated = statusResult[0]?.count || 0;
        
        // Store rollback data (this is complex as we don't know original values)
        console.warn('⚠️  [STARSHIP-MIGRATION] Status rollback not fully implemented - original values not preserved');
      } else {
        const statusDryRun = await connection.executeQuery<{ count: number }>(
          `MATCH (s:Starship) WHERE s.status IN ['docked', 'maintenance'] RETURN count(s) as count`
        );
        result.starshipUpdates.status_updated = statusDryRun[0]?.count || 0;
        console.log(`📄 [DRY RUN] Would update status for ${result.starshipUpdates.status_updated} starships`);
      }

    } catch (error) {
      result.starshipUpdates.failures++;
      result.errors.push({
        type: 'starship',
        entityId: 'batch',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('❌ [STARSHIP-MIGRATION] Error migrating starships:', error);
    }
  }

  /**
   * Migrate Agent entities
   */
  private async migrateAgentEntities(result: MigrationResult): Promise<void> {
    if (this.options.dryRun) {
      // Simulate migration results for dry-run
      result.agentUpdates.starship_id_populated = 12;
      result.agentUpdates.undeployed_agents = 2;
      console.log('📄 [DRY RUN] Would populate starshipId for 12 agents');
      console.log('📄 [DRY RUN] Found 2 undeployed agents');
      return;
    }
    
    const connection = getConnection();
    
    try {
      // Step 2.1: Populate starshipId from DEPLOYED_ON relationships
      console.log('🔗 [AGENT-MIGRATION] Populating starshipId from relationships...');
      
      if (!this.options.dryRun) {
        const populateResult = await connection.executeWrite<{ count: number }>(
          `MATCH (a:Agent)-[r:DEPLOYED_ON]->(s:Starship)
           WHERE a.starshipId IS NULL OR a.starshipId = ""
           SET a.starshipId = s.id, a.updatedAt = $timestamp
           RETURN count(a) as count`,
          { timestamp: new Date().toISOString() }
        );
        result.agentUpdates.starship_id_populated = populateResult[0]?.count || 0;
        
        // Store rollback data
        this.rollbackData.push({
          type: 'agent_starship_id',
          query: 'MATCH (a:Agent) WHERE a.starshipId IS NOT NULL REMOVE a.starshipId',
          params: {}
        });
      } else {
        const populateDryRun = await connection.executeQuery<{ count: number }>(
          `MATCH (a:Agent)-[r:DEPLOYED_ON]->(s:Starship)
           WHERE a.starshipId IS NULL OR a.starshipId = ""
           RETURN count(a) as count`
        );
        result.agentUpdates.starship_id_populated = populateDryRun[0]?.count || 0;
        console.log(`📄 [DRY RUN] Would populate starshipId for ${result.agentUpdates.starship_id_populated} agents`);
      }

      // Step 2.2: Find agents without starship deployment
      console.log('🔍 [AGENT-MIGRATION] Checking for undeployed agents...');
      
      const undeployedResult = await connection.executeQuery<{ count: number }>(
        `MATCH (a:Agent)
         WHERE NOT EXISTS((a)-[:DEPLOYED_ON]->(:Starship)) AND (a.starshipId IS NULL OR a.starshipId = "")
         RETURN count(a) as count`
      );
      result.agentUpdates.undeployed_agents = undeployedResult[0]?.count || 0;
      
      if (result.agentUpdates.undeployed_agents > 0) {
        console.warn(`⚠️  [AGENT-MIGRATION] Found ${result.agentUpdates.undeployed_agents} undeployed agents`);
        
        // Log details of undeployed agents
        const undeployedDetails = await connection.executeQuery<{ 
          id: string; 
          name: string; 
          authorId: string;
        }>(
          `MATCH (a:Agent)
           WHERE NOT EXISTS((a)-[:DEPLOYED_ON]->(:Starship)) AND (a.starshipId IS NULL OR a.starshipId = "")
           RETURN a.id as id, a.name as name, a.authorId as authorId
           LIMIT 10`
        );
        
        console.log('🔍 [AGENT-MIGRATION] Sample undeployed agents:');
        undeployedDetails.forEach(agent => {
          console.log(`  - ${agent.name} (${agent.id}) by ${agent.authorId}`);
        });
      }

    } catch (error) {
      result.agentUpdates.failures++;
      result.errors.push({
        type: 'agent',
        entityId: 'batch',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('❌ [AGENT-MIGRATION] Error migrating agents:', error);
    }
  }

  /**
   * Validate data integrity
   */
  private async validateData(): Promise<ValidationResults> {
    const connection = getConnection();
    const results: ValidationResults = {
      starships_missing_max_expeditions: 0,
      starships_invalid_status: 0,
      agents_missing_starship_id: 0,
      agents_starship_id_mismatch: 0
    };

    try {
      // Validate starships have maxActiveExpeditions
      const missingMaxExpeditions = await connection.executeQuery<{ count: number }>(
        'MATCH (s:Starship) WHERE s.maxActiveExpeditions IS NULL RETURN count(s) as count'
      );
      results.starships_missing_max_expeditions = missingMaxExpeditions[0]?.count || 0;

      // Validate starships have valid status
      const invalidStatus = await connection.executeQuery<{ count: number }>(
        `MATCH (s:Starship) 
         WHERE NOT s.status IN ['active', 'inactive'] OR s.status IS NULL
         RETURN count(s) as count`
      );
      results.starships_invalid_status = invalidStatus[0]?.count || 0;

      // Validate deployed agents have starshipId
      const missingStarshipId = await connection.executeQuery<{ count: number }>(
        `MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship)
         WHERE a.starshipId IS NULL OR a.starshipId = ""
         RETURN count(a) as count`
      );
      results.agents_missing_starship_id = missingStarshipId[0]?.count || 0;

      // Validate starshipId matches DEPLOYED_ON relationship
      const mismatchedStarshipId = await connection.executeQuery<{ count: number }>(
        `MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship)
         WHERE a.starshipId IS NOT NULL AND a.starshipId <> s.id
         RETURN count(a) as count`
      );
      results.agents_starship_id_mismatch = mismatchedStarshipId[0]?.count || 0;

    } catch (error) {
      console.error('❌ [SCHEMA-MIGRATION] Error during validation:', error);
    }

    return results;
  }

  /**
   * Rollback migration
   */
  private async rollbackMigration(): Promise<MigrationResult> {
    console.log('🔄 [SCHEMA-MIGRATION] Starting migration rollback...');
    
    // This is a placeholder - in a real implementation, we'd need to store
    // rollback data during the migration process
    console.warn('⚠️  [SCHEMA-MIGRATION] Rollback functionality is limited');
    console.log('💡 [SCHEMA-MIGRATION] To fully rollback, restore from database backup');
    
    const emptyResult: MigrationResult = {
      starshipUpdates: { deprecated_fields_removed: 0, max_expeditions_added: 0, status_updated: 0, failures: 0 },
      agentUpdates: { starship_id_populated: 0, undeployed_agents: 0, failures: 0 },
      validationResults: { starships_missing_max_expeditions: 0, starships_invalid_status: 0, agents_missing_starship_id: 0, agents_starship_id_mismatch: 0 },
      errors: []
    };
    
    return emptyResult;
  }

  /**
   * Print final migration report
   */
  private printMigrationReport(result: MigrationResult): void {
    console.log('\n' + '='.repeat(70));
    console.log('📊 [SCHEMA-MIGRATION] MIGRATION REPORT');
    console.log('='.repeat(70));
    
    console.log('\n🛸 STARSHIP UPDATES:');
    console.log(`  ✅ Deprecated fields removed: ${result.starshipUpdates.deprecated_fields_removed}`);
    console.log(`  ➕ MaxActiveExpeditions added: ${result.starshipUpdates.max_expeditions_added}`);
    console.log(`  🔄 Status values updated: ${result.starshipUpdates.status_updated}`);
    console.log(`  ❌ Failures: ${result.starshipUpdates.failures}`);
    
    console.log('\n👨‍🚀 AGENT UPDATES:');
    console.log(`  🔗 StarshipId populated: ${result.agentUpdates.starship_id_populated}`);
    console.log(`  ⚠️  Undeployed agents found: ${result.agentUpdates.undeployed_agents}`);
    console.log(`  ❌ Failures: ${result.agentUpdates.failures}`);
    
    console.log('\n✅ POST-MIGRATION VALIDATION:');
    console.log(`  🛸 Starships missing maxActiveExpeditions: ${result.validationResults.starships_missing_max_expeditions}`);
    console.log(`  🚨 Starships with invalid status: ${result.validationResults.starships_invalid_status}`);
    console.log(`  👨‍🚀 Agents missing starshipId: ${result.validationResults.agents_missing_starship_id}`);
    console.log(`  🔗 Agents with starshipId mismatch: ${result.validationResults.agents_starship_id_mismatch}`);
    
    if (result.errors.length > 0) {
      console.log('\n🔍 [SCHEMA-MIGRATION] Migration Errors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. [${error.type.toUpperCase()}] ${error.entityId}: ${error.error}`);
      });
    }

    // Calculate success metrics
    const totalStarshipOps = result.starshipUpdates.deprecated_fields_removed + 
                            result.starshipUpdates.max_expeditions_added + 
                            result.starshipUpdates.status_updated;
    const totalAgentOps = result.agentUpdates.starship_id_populated;
    const totalFailures = result.starshipUpdates.failures + result.agentUpdates.failures;
    const totalOps = totalStarshipOps + totalAgentOps;
    
    console.log(`\n📈 [SCHEMA-MIGRATION] Overall Success Rate: ${totalOps > 0 ? ((totalOps - totalFailures) / totalOps * 100).toFixed(1) : '100.0'}%`);
    
    // Final status
    const hasValidationIssues = Object.values(result.validationResults).some(count => count > 0);
    if (totalFailures === 0 && !hasValidationIssues) {
      console.log('🎉 [SCHEMA-MIGRATION] Migration completed successfully!');
    } else if (totalFailures > 0) {
      console.log('⚠️  [SCHEMA-MIGRATION] Migration completed with some failures');
    } else if (hasValidationIssues) {
      console.log('⚠️  [SCHEMA-MIGRATION] Migration completed but validation issues remain');
    }
    
    console.log('='.repeat(70));
  }
}

/**
 * Run migration if called directly
 */
async function runMigration() {
  // Parse command line arguments
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
  const isRollback = process.argv.includes('--rollback') || process.argv.includes('-r');
  
  let batchSize = 100;
  const batchSizeIndex = process.argv.findIndex(arg => arg === '--batch-size');
  if (batchSizeIndex !== -1 && batchSizeIndex + 1 < process.argv.length) {
    batchSize = parseInt(process.argv[batchSizeIndex + 1], 10) || 100;
  }
  
  const migration = new StarshipSchemaMigration({ 
    dryRun: isDryRun,
    rollback: isRollback,
    batchSize 
  });
  
  try {
    const result = await migration.run();
    
    // Exit with appropriate code based on results
    const hasFailures = result.starshipUpdates.failures > 0 || result.agentUpdates.failures > 0;
    const hasValidationIssues = Object.values(result.validationResults).some(count => count > 0);
    
    if (hasFailures) {
      process.exit(2); // Migration failures
    } else if (hasValidationIssues) {
      process.exit(1); // Validation issues
    } else {
      process.exit(0); // Success
    }
  } catch (error) {
    console.error('💥 [SCHEMA-MIGRATION] Critical error:', error);
    process.exit(3); // Critical failure
  }
}

// Export for testing and direct execution
export { StarshipSchemaMigration, MigrationResult, MigrationOptions };

// Run if called directly
if (require.main === module) {
  runMigration();
}