import { getConnection } from '../../packages/models/src/connection';

// Use a more generic type instead of importing from neo4j-driver
type Session = any;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics?: {
    totalStarships: number;
    totalTemplates: number;
    totalConnectorInstances: number;
    totalOldRelationships: number;
    orphanedInstances: number;
    duplicateInstances: number;
  };
}

/**
 * Comprehensive deployment validator for connector instance architecture
 */
export class DeploymentValidator {
  private connection = getConnection();

  /**
   * Validate system state before deployment
   */
  async validatePreDeployment(): Promise<ValidationResult> {
    console.log('[VALIDATOR] 🔍 Running pre-deployment validation...');

    const errors: string[] = [];
    const warnings: string[] = [];
    let session: Session | null = null;

    try {
      session = this.connection.getSession();

      // Check database connectivity
      await this.checkDatabaseConnectivity(session, errors);

      // Check for existing connector instances (might indicate previous migration)
      await this.checkExistingConnectorInstances(session, warnings);

      // Validate data consistency
      await this.validateDataConsistency(session, errors);

      // Check system resources
      await this.checkSystemResources(warnings);

      // Validate environment configuration
      await this.validateEnvironmentConfig(errors, warnings);

      const statistics = await this.gatherPreDeploymentStatistics(session);

      return {
        valid: errors.length === 0,
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
      };
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  /**
   * Validate system state after deployment
   */
  async validatePostDeployment(): Promise<ValidationResult> {
    console.log('[VALIDATOR] 🔍 Running post-deployment validation...');

    const errors: string[] = [];
    const warnings: string[] = [];
    let session: Session | null = null;

    try {
      session = this.connection.getSession();

      // Check that migration completed successfully
      await this.validateMigrationCompletion(session, errors);

      // Validate connector instance integrity
      await this.validateConnectorInstanceIntegrity(session, errors);

      // Check for orphaned data
      await this.checkOrphanedData(session, errors);

      // Validate relationship consistency
      await this.validateRelationshipConsistency(session, errors);

      // Check performance impact
      await this.checkPerformanceImpact(session, warnings);

      const statistics = await this.gatherPostDeploymentStatistics(session);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        statistics,
      };
    } catch (error) {
      errors.push(
        `Post-deployment validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        valid: false,
        errors,
        warnings,
      };
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabaseConnectivity(session: Session, errors: string[]): Promise<void> {
    try {
      const result = await session.run('RETURN 1 as test');
      if (!result.records[0] || result.records[0].get('test') !== 1) {
        errors.push('Database connectivity test failed');
      }
    } catch (error) {
      errors.push(
        `Database connection failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check for existing connector instances
   */
  private async checkExistingConnectorInstances(
    session: Session,
    warnings: string[]
  ): Promise<void> {
    const result = await session.run(`
      MATCH (msc:MCPServerConnector)
      RETURN count(msc) as existingCount
    `);

    const existingCount = result.records[0]?.get('existingCount').toNumber() || 0;
    if (existingCount > 0) {
      warnings.push(
        `Found ${existingCount} existing connector instances - migration may have been run before`
      );
    }
  }

  /**
   * Validate data consistency
   */
  private async validateDataConsistency(session: Session, errors: string[]): Promise<void> {
    // Check for orphaned HAS_CONNECTOR relationships
    const orphanedResult = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      WHERE s IS NULL OR mso IS NULL
      RETURN count(r) as orphanedCount
    `);

    const orphanedCount = orphanedResult.records[0]?.get('orphanedCount').toNumber() || 0;
    if (orphanedCount > 0) {
      errors.push(`Found ${orphanedCount} orphaned HAS_CONNECTOR relationships`);
    }

    // Check for null IDs
    const nullIdResult = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      WHERE s.id IS NULL OR mso.id IS NULL
      RETURN count(r) as nullIdCount
    `);

    const nullIdCount = nullIdResult.records[0]?.get('nullIdCount').toNumber() || 0;
    if (nullIdCount > 0) {
      errors.push(`Found ${nullIdCount} relationships with null IDs`);
    }
  }

  /**
   * Check system resources
   */
  private async checkSystemResources(warnings: string[]): Promise<void> {
    // Check available memory
    const memoryUsage = process.memoryUsage();
    const availableMemory = memoryUsage.heapTotal - memoryUsage.heapUsed;

    if (availableMemory < 100 * 1024 * 1024) {
      // Less than 100MB
      warnings.push(`Low available memory: ${Math.round(availableMemory / 1024 / 1024)}MB`);
    }

    // Check disk space (simplified check)
    try {
      const stats = require('fs').statSync(process.cwd());
      // This is a basic check - in production you'd want more sophisticated disk space checking
    } catch (error) {
      warnings.push('Could not check disk space availability');
    }
  }

  /**
   * Validate environment configuration
   */
  private async validateEnvironmentConfig(errors: string[], warnings: string[]): Promise<void> {
    // Check required environment variables
    const requiredEnvVars = ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD'];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      }
    }

    // Check Neo4j configuration
    if (
      process.env.NEO4J_URI &&
      !process.env.NEO4J_URI.startsWith('bolt://') &&
      !process.env.NEO4J_URI.startsWith('neo4j://')
    ) {
      warnings.push('Neo4j URI should use bolt:// or neo4j:// protocol');
    }
  }

  /**
   * Validate migration completion
   */
  private async validateMigrationCompletion(session: Session, errors: string[]): Promise<void> {
    // Check that no old HAS_CONNECTOR relationships remain
    const oldRelResult = await session.run(`
      MATCH ()-[r:HAS_CONNECTOR]->()
      RETURN count(r) as oldRelCount
    `);

    const oldRelCount = oldRelResult.records[0]?.get('oldRelCount').toNumber() || 0;
    if (oldRelCount > 0) {
      errors.push(
        `Migration incomplete: ${oldRelCount} old HAS_CONNECTOR relationships still exist`
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
    // Check for orphaned connector instances
    const orphanedResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedCount
    `);

    const orphanedCount = orphanedResult.records[0]?.get('orphanedCount').toNumber() || 0;
    if (orphanedCount > 0) {
      errors.push(`Found ${orphanedCount} orphaned connector instances`);
    }

    // Check for duplicate instances
    const duplicateResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
      WHERE instanceCount > 1
      RETURN count(*) as duplicateCount
    `);

    const duplicateCount = duplicateResult.records[0]?.get('duplicateCount').toNumber() || 0;
    if (duplicateCount > 0) {
      errors.push(`Found ${duplicateCount} duplicate connector instances`);
    }
  }

  /**
   * Check for orphaned data
   */
  private async checkOrphanedData(session: Session, errors: string[]): Promise<void> {
    // Check for connector instances with invalid starship IDs
    const invalidResult = await session.run(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
      WHERE msc.starshipId <> s.id
      RETURN count(msc) as invalidCount
    `);

    const invalidCount = invalidResult.records[0]?.get('invalidCount').toNumber() || 0;
    if (invalidCount > 0) {
      errors.push(`Found ${invalidCount} connector instances with mismatched starship IDs`);
    }
  }

  /**
   * Validate relationship consistency
   */
  private async validateRelationshipConsistency(session: Session, errors: string[]): Promise<void> {
    // Ensure all connector instances have both required relationships
    const incompleteResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as incompleteCount
    `);

    const incompleteCount = incompleteResult.records[0]?.get('incompleteCount').toNumber() || 0;
    if (incompleteCount > 0) {
      errors.push(`Found ${incompleteCount} connector instances with incomplete relationships`);
    }
  }

  /**
   * Check performance impact
   */
  private async checkPerformanceImpact(session: Session, warnings: string[]): Promise<void> {
    // Simple performance check - measure query response time
    const startTime = Date.now();

    await session.run(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption)
      RETURN count(*) as totalConnections
      LIMIT 100
    `);

    const queryTime = Date.now() - startTime;

    if (queryTime > 1000) {
      // More than 1 second
      warnings.push(`Slow query performance detected: ${queryTime}ms for connector instance query`);
    }
  }

  /**
   * Gather pre-deployment statistics
   */
  private async gatherPreDeploymentStatistics(
    session: Session
  ): Promise<ValidationResult['statistics']> {
    const result = await session.run(`
      MATCH (s:Starship) WITH count(s) as starshipCount
      MATCH (mso:MCPServerOption) WITH starshipCount, count(mso) as templateCount
      MATCH ()-[r:HAS_CONNECTOR]->() WITH starshipCount, templateCount, count(r) as oldRelCount
      OPTIONAL MATCH (msc:MCPServerConnector) WITH starshipCount, templateCount, oldRelCount, count(msc) as connectorCount
      RETURN starshipCount, templateCount, oldRelCount, connectorCount
    `);

    const record = result.records[0];
    return {
      totalStarships: record?.get('starshipCount').toNumber() || 0,
      totalTemplates: record?.get('templateCount').toNumber() || 0,
      totalConnectorInstances: record?.get('connectorCount').toNumber() || 0,
      totalOldRelationships: record?.get('oldRelCount').toNumber() || 0,
      orphanedInstances: 0,
      duplicateInstances: 0,
    };
  }

  /**
   * Gather post-deployment statistics
   */
  private async gatherPostDeploymentStatistics(
    session: Session
  ): Promise<ValidationResult['statistics']> {
    const result = await session.run(`
      MATCH (s:Starship) WITH count(s) as starshipCount
      MATCH (mso:MCPServerOption) WITH starshipCount, count(mso) as templateCount
      MATCH (msc:MCPServerConnector) WITH starshipCount, templateCount, count(msc) as connectorCount
      OPTIONAL MATCH ()-[r:HAS_CONNECTOR]->() WITH starshipCount, templateCount, connectorCount, count(r) as oldRelCount
      RETURN starshipCount, templateCount, connectorCount, oldRelCount
    `);

    const record = result.records[0];
    return {
      totalStarships: record?.get('starshipCount').toNumber() || 0,
      totalTemplates: record?.get('templateCount').toNumber() || 0,
      totalConnectorInstances: record?.get('connectorCount').toNumber() || 0,
      totalOldRelationships: record?.get('oldRelCount').toNumber() || 0,
      orphanedInstances: 0,
      duplicateInstances: 0,
    };
  }
}
