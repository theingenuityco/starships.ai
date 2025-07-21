import { getConnection } from '../connection';
import { Session } from 'neo4j-driver';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalConnectorInstances: number;
    totalStarships: number;
    totalTemplates: number;
    orphanedInstances: number;
    duplicateInstances: number;
    oldRelationships: number;
    integrityScore: number;
  };
}

/**
 * Comprehensive migration validator for connector instance architecture
 */
export class MigrationValidator {
  private connection = getConnection();

  /**
   * Run comprehensive migration validation
   */
  async validateMigration(): Promise<ValidationResult> {
    console.log('[VALIDATOR] 🔍 Running comprehensive migration validation...');

    const errors: string[] = [];
    const warnings: string[] = [];
    let session: Session | null = null;

    try {
      session = this.connection.getSession();

      // Validation 1: Check for old relationships
      await this.validateOldRelationshipsRemoved(session, errors);

      // Validation 2: Check connector instance integrity
      await this.validateConnectorInstanceIntegrity(session, errors);

      // Validation 3: Check for orphaned instances
      await this.validateNoOrphanedInstances(session, errors);

      // Validation 4: Check for duplicate instances
      await this.validateNoDuplicateInstances(session, errors);

      // Validation 5: Check relationship consistency
      await this.validateRelationshipConsistency(session, errors);

      // Validation 6: Check data completeness
      await this.validateDataCompleteness(session, errors, warnings);

      // Validation 7: Check performance impact
      await this.validatePerformanceImpact(session, warnings);

      // Gather comprehensive statistics
      const statistics = await this.gatherValidationStatistics(session);

      const valid = errors.length === 0;

      console.log(
        `[VALIDATOR] ${valid ? '✅' : '❌'} Validation completed: ${valid ? 'PASSED' : 'FAILED'}`
      );
      console.log(`[VALIDATOR] 📊 Statistics:`, statistics);

      return {
        valid,
        errors,
        warnings,
        statistics,
      };
    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        valid: false,
        errors,
        warnings,
        statistics: {
          totalConnectorInstances: 0,
          totalStarships: 0,
          totalTemplates: 0,
          orphanedInstances: 0,
          duplicateInstances: 0,
          oldRelationships: 0,
          integrityScore: 0,
        },
      };
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  /**
   * Validate that old HAS_CONNECTOR relationships have been removed
   */
  private async validateOldRelationshipsRemoved(session: Session, errors: string[]): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking for old HAS_CONNECTOR relationships...');

    const result = await session.run(`
      MATCH ()-[r:HAS_CONNECTOR]->()
      RETURN count(r) as oldRelCount
    `);

    const oldRelCount = result.records[0]?.get('oldRelCount').toNumber() || 0;
    if (oldRelCount > 0) {
      errors.push(
        `Found ${oldRelCount} old HAS_CONNECTOR relationships that should have been migrated`
      );
    }
  }

  /**
   * Validate connector instance integrity
   */
  private async validateConnectorInstanceIntegrity(
    session: Session,
    errors: string[]
  ): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking connector instance integrity...');

    // Check that all connector instances have required properties
    const missingPropsResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE msc.id IS NULL 
         OR msc.starshipId IS NULL 
         OR msc.templateId IS NULL 
         OR msc.status IS NULL
         OR msc.isActive IS NULL
      RETURN count(msc) as missingPropsCount
    `);

    const missingPropsCount =
      missingPropsResult.records[0]?.get('missingPropsCount').toNumber() || 0;
    if (missingPropsCount > 0) {
      errors.push(
        `Found ${missingPropsCount} connector instances with missing required properties`
      );
    }

    // Check for invalid status values
    const invalidStatusResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT msc.status IN ['active', 'inactive', 'error', 'connecting']
      RETURN count(msc) as invalidStatusCount
    `);

    const invalidStatusCount =
      invalidStatusResult.records[0]?.get('invalidStatusCount').toNumber() || 0;
    if (invalidStatusCount > 0) {
      errors.push(`Found ${invalidStatusCount} connector instances with invalid status values`);
    }
  }

  /**
   * Validate no orphaned connector instances exist
   */
  private async validateNoOrphanedInstances(session: Session, errors: string[]): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking for orphaned connector instances...');

    const orphanedResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedCount
    `);

    const orphanedCount = orphanedResult.records[0]?.get('orphanedCount').toNumber() || 0;
    if (orphanedCount > 0) {
      errors.push(
        `Found ${orphanedCount} orphaned connector instances without proper relationships`
      );
    }
  }

  /**
   * Validate no duplicate connector instances exist
   */
  private async validateNoDuplicateInstances(session: Session, errors: string[]): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking for duplicate connector instances...');

    const duplicateResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
      WHERE instanceCount > 1
      RETURN count(*) as duplicateCount, collect({starshipId: starshipId, templateId: templateId, count: instanceCount}) as duplicates
    `);

    const duplicateCount = duplicateResult.records[0]?.get('duplicateCount').toNumber() || 0;
    if (duplicateCount > 0) {
      const duplicates = duplicateResult.records[0]?.get('duplicates') || [];
      errors.push(`Found ${duplicateCount} sets of duplicate connector instances`);

      // Log details about duplicates for debugging
      duplicates.forEach((dup: any, index: number) => {
        errors.push(
          `  Duplicate ${index + 1}: Starship ${dup.starshipId} + Template ${dup.templateId} (${dup.count} instances)`
        );
      });
    }
  }

  /**
   * Validate relationship consistency
   */
  private async validateRelationshipConsistency(session: Session, errors: string[]): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking relationship consistency...');

    // Check that starshipId in connector matches the connected starship
    const inconsistentResult = await session.run(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
      WHERE msc.starshipId <> s.id
      RETURN count(msc) as inconsistentCount
    `);

    const inconsistentCount =
      inconsistentResult.records[0]?.get('inconsistentCount').toNumber() || 0;
    if (inconsistentCount > 0) {
      errors.push(`Found ${inconsistentCount} connector instances with inconsistent starship IDs`);
    }

    // Check that templateId in connector matches the connected template
    const templateInconsistentResult = await session.run(`
      MATCH (msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption)
      WHERE msc.templateId <> mso.id
      RETURN count(msc) as templateInconsistentCount
    `);

    const templateInconsistentCount =
      templateInconsistentResult.records[0]?.get('templateInconsistentCount').toNumber() || 0;
    if (templateInconsistentCount > 0) {
      errors.push(
        `Found ${templateInconsistentCount} connector instances with inconsistent template IDs`
      );
    }
  }

  /**
   * Validate data completeness
   */
  private async validateDataCompleteness(
    session: Session,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking data completeness...');

    // Check that all starships have at least some connector instances (if they had connectors before)
    const starshipsWithoutConnectorsResult = await session.run(`
      MATCH (s:Starship)
      WHERE NOT EXISTS((s)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector))
      RETURN count(s) as starshipsWithoutConnectors
    `);

    const starshipsWithoutConnectors =
      starshipsWithoutConnectorsResult.records[0]?.get('starshipsWithoutConnectors').toNumber() ||
      0;
    if (starshipsWithoutConnectors > 0) {
      warnings.push(
        `Found ${starshipsWithoutConnectors} starships without any connector instances - verify this is expected`
      );
    }

    // Check that all templates are still referenced by at least one connector instance
    const unreferencedTemplatesResult = await session.run(`
      MATCH (mso:MCPServerOption)
      WHERE NOT EXISTS((mso)<-[:CREATED_FROM]-(:MCPServerConnector))
      RETURN count(mso) as unreferencedTemplates
    `);

    const unreferencedTemplates =
      unreferencedTemplatesResult.records[0]?.get('unreferencedTemplates').toNumber() || 0;
    if (unreferencedTemplates > 0) {
      warnings.push(
        `Found ${unreferencedTemplates} MCP server templates not referenced by any connector instances`
      );
    }
  }

  /**
   * Validate performance impact
   */
  private async validatePerformanceImpact(session: Session, warnings: string[]): Promise<void> {
    console.log('[VALIDATOR] 🔍 Checking performance impact...');

    // Test query performance for common operations
    const startTime = Date.now();

    await session.run(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption)
      RETURN count(*) as totalConnections
      LIMIT 100
    `);

    const queryTime = Date.now() - startTime;

    if (queryTime > 1000) {
      warnings.push(`Slow query performance detected: ${queryTime}ms for connector instance query`);
    }

    // Check for potential index usage
    const explainResult = await session.run(`
      EXPLAIN MATCH (s:Starship {id: 'test'})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
      RETURN msc
    `);

    // This is a simplified check - in practice you'd analyze the execution plan
    const planString = JSON.stringify(explainResult);
    if (!planString.includes('NodeIndexSeek') && !planString.includes('NodeUniqueIndexSeek')) {
      warnings.push('Query execution may not be using indexes optimally - consider adding indexes');
    }
  }

  /**
   * Gather comprehensive validation statistics
   */
  private async gatherValidationStatistics(
    session: Session
  ): Promise<ValidationResult['statistics']> {
    console.log('[VALIDATOR] 📊 Gathering validation statistics...');

    const statsResult = await session.run(`
      MATCH (msc:MCPServerConnector) WITH count(msc) as connectorCount
      MATCH (s:Starship) WITH connectorCount, count(s) as starshipCount
      MATCH (mso:MCPServerOption) WITH connectorCount, starshipCount, count(mso) as templateCount
      OPTIONAL MATCH ()-[r:HAS_CONNECTOR]->() WITH connectorCount, starshipCount, templateCount, count(r) as oldRelCount
      RETURN connectorCount, starshipCount, templateCount, oldRelCount
    `);

    const record = statsResult.records[0];
    const totalConnectorInstances = record?.get('connectorCount').toNumber() || 0;
    const totalStarships = record?.get('starshipCount').toNumber() || 0;
    const totalTemplates = record?.get('templateCount').toNumber() || 0;
    const oldRelationships = record?.get('oldRelCount').toNumber() || 0;

    // Check for orphaned instances
    const orphanedResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedCount
    `);
    const orphanedInstances = orphanedResult.records[0]?.get('orphanedCount').toNumber() || 0;

    // Check for duplicate instances
    const duplicateResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
      WHERE instanceCount > 1
      RETURN count(*) as duplicateCount
    `);
    const duplicateInstances = duplicateResult.records[0]?.get('duplicateCount').toNumber() || 0;

    // Calculate integrity score (0-100)
    let integrityScore = 100;
    if (oldRelationships > 0) integrityScore -= 30;
    if (orphanedInstances > 0) integrityScore -= 25;
    if (duplicateInstances > 0) integrityScore -= 20;
    if (totalConnectorInstances === 0 && totalStarships > 0) integrityScore -= 25;

    return {
      totalConnectorInstances,
      totalStarships,
      totalTemplates,
      orphanedInstances,
      duplicateInstances,
      oldRelationships,
      integrityScore: Math.max(0, integrityScore),
    };
  }

  /**
   * Run a quick validation check (subset of full validation)
   */
  async validateQuick(): Promise<{ valid: boolean; criticalErrors: string[] }> {
    console.log('[VALIDATOR] ⚡ Running quick validation check...');

    const criticalErrors: string[] = [];
    let session: Session | null = null;

    try {
      session = this.connection.getSession();

      // Quick check 1: Old relationships
      const oldRelResult = await session.run(`
        MATCH ()-[r:HAS_CONNECTOR]->()
        RETURN count(r) as oldRelCount
        LIMIT 1
      `);

      if (oldRelResult.records[0]?.get('oldRelCount').toNumber() > 0) {
        criticalErrors.push('Old HAS_CONNECTOR relationships still exist');
      }

      // Quick check 2: Orphaned instances
      const orphanedResult = await session.run(`
        MATCH (msc:MCPServerConnector)
        WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
        RETURN count(msc) as orphanedCount
        LIMIT 1
      `);

      if (orphanedResult.records[0]?.get('orphanedCount').toNumber() > 0) {
        criticalErrors.push('Orphaned connector instances detected');
      }

      return {
        valid: criticalErrors.length === 0,
        criticalErrors,
      };
    } catch (error) {
      criticalErrors.push(
        `Quick validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        valid: false,
        criticalErrors,
      };
    } finally {
      if (session) {
        await session.close();
      }
    }
  }
}

/**
 * CLI interface for migration validation
 */
export async function runValidation(): Promise<void> {
  console.log('🔍 Migration Validation Utility');
  console.log('===============================');

  try {
    const validator = new MigrationValidator();
    const result = await validator.validateMigration();

    if (result.valid) {
      console.log('\n✅ Migration validation passed!');
      console.log('📊 Statistics:', result.statistics);
      console.log(`🎯 Integrity Score: ${result.statistics.integrityScore}/100`);
    } else {
      console.error('\n❌ Migration validation failed!');
      console.error('🔍 Errors:');
      result.errors.forEach((error, index) => {
        console.error(`   ${index + 1}. ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      result.warnings.forEach((warning, index) => {
        console.warn(`   ${index + 1}. ${warning}`);
      });
    }

    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Validation failed with error:', error);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  runValidation().catch(console.error);
}
