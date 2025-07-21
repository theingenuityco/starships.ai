#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';

interface SchemaValidationResult {
  constraintsCreated: number;
  indexesCreated: number;
  validationsPassed: number;
  validationsFailed: number;
  errors: string[];
}

/**
 * MCPServerConnector Schema Creator
 *
 * Creates Neo4j constraints and indexes for MCPServerConnector nodes
 * as part of the connector instance implementation plan.
 */
export class MCPServerConnectorSchemaCreator {
  private connection: any;
  private results: SchemaValidationResult = {
    constraintsCreated: 0,
    indexesCreated: 0,
    validationsPassed: 0,
    validationsFailed: 0,
    errors: [],
  };

  constructor() {
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'mcppassword',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    this.connection = createConnection(config);
  }

  /**
   * Create all constraints for MCPServerConnector nodes
   */
  private async createConstraints(): Promise<void> {
    console.log('📋 Creating MCPServerConnector Constraints');
    console.log('=========================================');

    const constraints = [
      {
        name: 'connector_instance_id',
        cypher:
          'CREATE CONSTRAINT connector_instance_id IF NOT EXISTS FOR (c:MCPServerConnector) REQUIRE c.id IS UNIQUE',
        description: 'Unique constraint on MCPServerConnector.id',
      },
      {
        name: 'connector_instance_starship_template',
        cypher:
          'CREATE CONSTRAINT connector_instance_starship_template IF NOT EXISTS FOR (c:MCPServerConnector) REQUIRE (c.starshipId, c.templateId) IS UNIQUE',
        description: 'Composite unique constraint on (starshipId, templateId) pair',
      },
    ];

    for (const constraint of constraints) {
      try {
        console.log(`⚡ Creating constraint: ${constraint.name}`);
        console.log(`   ${constraint.description}`);

        await this.connection.executeWrite(constraint.cypher);
        this.results.constraintsCreated++;
        console.log(`✅ Constraint created: ${constraint.name}`);
      } catch (error) {
        const errorMsg = `Failed to create constraint ${constraint.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        this.results.errors.push(errorMsg);
      }
    }

    console.log('');
  }

  /**
   * Create performance indexes for MCPServerConnector nodes
   */
  private async createIndexes(): Promise<void> {
    console.log('🚀 Creating MCPServerConnector Performance Indexes');
    console.log('=================================================');

    const indexes = [
      {
        name: 'connector_instance_starship',
        cypher:
          'CREATE INDEX connector_instance_starship IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.starshipId)',
        description: 'Index on starshipId for fast starship-based queries',
      },
      {
        name: 'connector_instance_template',
        cypher:
          'CREATE INDEX connector_instance_template IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.templateId)',
        description: 'Index on templateId for fast template-based queries',
      },
      {
        name: 'connector_instance_status',
        cypher:
          'CREATE INDEX connector_instance_status IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.status)',
        description: 'Index on status for filtering by connector status',
      },
      {
        name: 'connector_instance_active',
        cypher:
          'CREATE INDEX connector_instance_active IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.isActive)',
        description: 'Index on isActive for filtering active/inactive connectors',
      },
    ];

    for (const index of indexes) {
      try {
        console.log(`⚡ Creating index: ${index.name}`);
        console.log(`   ${index.description}`);

        await this.connection.executeWrite(index.cypher);
        this.results.indexesCreated++;
        console.log(`✅ Index created: ${index.name}`);
      } catch (error) {
        const errorMsg = `Failed to create index ${index.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        this.results.errors.push(errorMsg);
      }
    }

    console.log('');
  }

  /**
   * Validate that constraints are working properly
   */
  private async validateConstraints(): Promise<void> {
    console.log('🔍 Validating MCPServerConnector Constraints');
    console.log('===========================================');

    await this.validateUniqueIdConstraint();
    await this.validateCompositeUniqueConstraint();

    console.log('');
  }

  /**
   * Test unique ID constraint
   */
  private async validateUniqueIdConstraint(): Promise<void> {
    try {
      console.log('⚡ Testing unique ID constraint...');

      // Create a test connector
      const testId = 'test-connector-unique-id';
      await this.connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: $id,
          starshipId: 'test-starship-1',
          templateId: 'test-template-1',
          status: 'active',
          isActive: true,
          createdAt: datetime()
        })`,
        { id: testId }
      );

      // Try to create another connector with the same ID - should fail
      try {
        await this.connection.executeWrite(
          `CREATE (c:MCPServerConnector {
            id: $id,
            starshipId: 'test-starship-2',
            templateId: 'test-template-2',
            status: 'active',
            isActive: true,
            createdAt: datetime()
          })`,
          { id: testId }
        );

        // If we get here, the constraint failed
        this.results.validationsFailed++;
        this.results.errors.push(
          'Unique ID constraint validation failed - duplicate ID was allowed'
        );
        console.log('❌ Unique ID constraint validation FAILED - duplicate ID was allowed');
      } catch (error) {
        // This is expected - the constraint should prevent the duplicate
        this.results.validationsPassed++;
        console.log('✅ Unique ID constraint validation PASSED - duplicate ID was prevented');
      }

      // Clean up test data
      await this.connection.executeWrite('MATCH (c:MCPServerConnector {id: $id}) DELETE c', {
        id: testId,
      });
    } catch (error) {
      const errorMsg = `Unique ID constraint validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Test composite unique constraint on (starshipId, templateId)
   */
  private async validateCompositeUniqueConstraint(): Promise<void> {
    try {
      console.log('⚡ Testing composite unique constraint (starshipId, templateId)...');

      const testStarshipId = 'test-starship-composite';
      const testTemplateId = 'test-template-composite';

      // Create a test connector
      await this.connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: 'test-connector-composite-1',
          starshipId: $starshipId,
          templateId: $templateId,
          status: 'active',
          isActive: true,
          createdAt: datetime()
        })`,
        { starshipId: testStarshipId, templateId: testTemplateId }
      );

      // Try to create another connector with the same starshipId + templateId - should fail
      try {
        await this.connection.executeWrite(
          `CREATE (c:MCPServerConnector {
            id: 'test-connector-composite-2',
            starshipId: $starshipId,
            templateId: $templateId,
            status: 'active',
            isActive: true,
            createdAt: datetime()
          })`,
          { starshipId: testStarshipId, templateId: testTemplateId }
        );

        // If we get here, the constraint failed
        this.results.validationsFailed++;
        this.results.errors.push(
          'Composite unique constraint validation failed - duplicate (starshipId, templateId) was allowed'
        );
        console.log(
          '❌ Composite unique constraint validation FAILED - duplicate (starshipId, templateId) was allowed'
        );
      } catch (error) {
        // This is expected - the constraint should prevent the duplicate
        this.results.validationsPassed++;
        console.log(
          '✅ Composite unique constraint validation PASSED - duplicate (starshipId, templateId) was prevented'
        );
      }

      // Test that different combinations are allowed
      await this.connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: 'test-connector-composite-different',
          starshipId: $starshipId,
          templateId: 'different-template',
          status: 'active',
          isActive: true,
          createdAt: datetime()
        })`,
        { starshipId: testStarshipId }
      );

      this.results.validationsPassed++;
      console.log('✅ Composite unique constraint allows different combinations');

      // Clean up test data
      await this.connection.executeWrite(
        `MATCH (c:MCPServerConnector) 
         WHERE c.starshipId = $starshipId OR c.id STARTS WITH 'test-connector-composite'
         DELETE c`,
        { starshipId: testStarshipId }
      );
    } catch (error) {
      const errorMsg = `Composite unique constraint validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Validate that indexes are being used and improve performance
   */
  private async validateIndexPerformance(): Promise<void> {
    console.log('📊 Validating Index Performance');
    console.log('==============================');

    await this.validateStarshipIdIndex();
    await this.validateTemplateIdIndex();
    await this.validateStatusIndex();
    await this.validateActiveIndex();

    console.log('');
  }

  /**
   * Test starshipId index performance
   */
  private async validateStarshipIdIndex(): Promise<void> {
    try {
      console.log('⚡ Testing starshipId index performance...');

      // Create test data
      const testData = [];
      for (let i = 0; i < 100; i++) {
        testData.push({
          id: `perf-test-${i}`,
          starshipId: `starship-${i % 10}`, // 10 different starships
          templateId: `template-${i}`,
          status: i % 2 === 0 ? 'active' : 'inactive',
          isActive: i % 3 === 0,
        });
      }

      // Insert test data
      for (const data of testData) {
        await this.connection.executeWrite(
          `CREATE (c:MCPServerConnector {
            id: $id,
            starshipId: $starshipId,
            templateId: $templateId,
            status: $status,
            isActive: $isActive,
            createdAt: datetime()
          })`,
          data
        );
      }

      // Test query with EXPLAIN to check if index is used
      const explainResult = await this.connection.executeQuery(
        'EXPLAIN MATCH (c:MCPServerConnector) WHERE c.starshipId = $starshipId RETURN c',
        { starshipId: 'starship-1' }
      );

      // Check if the execution plan mentions the index
      const planString = JSON.stringify(explainResult);
      const usesIndex =
        planString.includes('NodeIndexSeek') || planString.includes('connector_instance_starship');

      if (usesIndex) {
        this.results.validationsPassed++;
        console.log('✅ StarshipId index is being used in query execution');
      } else {
        this.results.validationsFailed++;
        this.results.errors.push('StarshipId index is not being used in query execution');
        console.log('❌ StarshipId index is not being used in query execution');
      }

      // Clean up test data
      await this.connection.executeWrite(
        'MATCH (c:MCPServerConnector) WHERE c.id STARTS WITH "perf-test-" DELETE c'
      );
    } catch (error) {
      const errorMsg = `StarshipId index validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Test templateId index performance
   */
  private async validateTemplateIdIndex(): Promise<void> {
    try {
      console.log('⚡ Testing templateId index performance...');

      // Test query with EXPLAIN to check if index is used
      const explainResult = await this.connection.executeQuery(
        'EXPLAIN MATCH (c:MCPServerConnector) WHERE c.templateId = $templateId RETURN c',
        { templateId: 'test-template' }
      );

      // Check if the execution plan mentions the index
      const planString = JSON.stringify(explainResult);
      const usesIndex =
        planString.includes('NodeIndexSeek') || planString.includes('connector_instance_template');

      if (usesIndex) {
        this.results.validationsPassed++;
        console.log('✅ TemplateId index is being used in query execution');
      } else {
        this.results.validationsFailed++;
        this.results.errors.push('TemplateId index is not being used in query execution');
        console.log('❌ TemplateId index is not being used in query execution');
      }
    } catch (error) {
      const errorMsg = `TemplateId index validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Test status index performance
   */
  private async validateStatusIndex(): Promise<void> {
    try {
      console.log('⚡ Testing status index performance...');

      // Test query with EXPLAIN to check if index is used
      const explainResult = await this.connection.executeQuery(
        'EXPLAIN MATCH (c:MCPServerConnector) WHERE c.status = $status RETURN c',
        { status: 'active' }
      );

      // Check if the execution plan mentions the index
      const planString = JSON.stringify(explainResult);
      const usesIndex =
        planString.includes('NodeIndexSeek') || planString.includes('connector_instance_status');

      if (usesIndex) {
        this.results.validationsPassed++;
        console.log('✅ Status index is being used in query execution');
      } else {
        this.results.validationsFailed++;
        this.results.errors.push('Status index is not being used in query execution');
        console.log('❌ Status index is not being used in query execution');
      }
    } catch (error) {
      const errorMsg = `Status index validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Test isActive index performance
   */
  private async validateActiveIndex(): Promise<void> {
    try {
      console.log('⚡ Testing isActive index performance...');

      // Test query with EXPLAIN to check if index is used
      const explainResult = await this.connection.executeQuery(
        'EXPLAIN MATCH (c:MCPServerConnector) WHERE c.isActive = $isActive RETURN c',
        { isActive: true }
      );

      // Check if the execution plan mentions the index
      const planString = JSON.stringify(explainResult);
      const usesIndex =
        planString.includes('NodeIndexSeek') || planString.includes('connector_instance_active');

      if (usesIndex) {
        this.results.validationsPassed++;
        console.log('✅ IsActive index is being used in query execution');
      } else {
        this.results.validationsFailed++;
        this.results.errors.push('IsActive index is not being used in query execution');
        console.log('❌ IsActive index is not being used in query execution');
      }
    } catch (error) {
      const errorMsg = `IsActive index validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
      this.results.validationsFailed++;
    }
  }

  /**
   * Verify schema creation by listing constraints and indexes
   */
  private async verifySchemaCreation(): Promise<void> {
    console.log('🔍 Verifying Schema Creation');
    console.log('===========================');

    try {
      // List all constraints
      console.log('📋 Checking constraints...');
      const constraints = await this.connection.executeQuery('SHOW CONSTRAINTS');
      const connectorConstraints = constraints.filter(
        (c: any) =>
          c.name &&
          (c.name.includes('connector_instance') ||
            (c.labelsOrTypes && c.labelsOrTypes.includes('MCPServerConnector')))
      );

      console.log(`✅ Found ${connectorConstraints.length} MCPServerConnector constraints:`);
      connectorConstraints.forEach((constraint: any) => {
        console.log(`   - ${constraint.name}: ${constraint.description || 'N/A'}`);
      });

      // List all indexes
      console.log('\n🚀 Checking indexes...');
      const indexes = await this.connection.executeQuery('SHOW INDEXES');
      const connectorIndexes = indexes.filter(
        (i: any) =>
          i.name &&
          (i.name.includes('connector_instance') ||
            (i.labelsOrTypes && i.labelsOrTypes.includes('MCPServerConnector')))
      );

      console.log(`✅ Found ${connectorIndexes.length} MCPServerConnector indexes:`);
      connectorIndexes.forEach((index: any) => {
        console.log(`   - ${index.name}: ${index.properties || 'N/A'} (${index.state || 'N/A'})`);
      });
    } catch (error) {
      const errorMsg = `Schema verification error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      this.results.errors.push(errorMsg);
    }

    console.log('');
  }

  /**
   * Run the complete schema creation and validation process
   */
  async createSchema(): Promise<SchemaValidationResult> {
    console.log('🚀 MCPServerConnector Schema Creation Started');
    console.log('=============================================');
    console.log('Phase 1, Task 1.1: Create MCPServerConnector node type and constraints\n');

    try {
      await this.connection.connect();
      console.log('✅ Connected to Neo4j database\n');

      // Create constraints
      await this.createConstraints();

      // Create indexes
      await this.createIndexes();

      // Validate constraints work properly
      await this.validateConstraints();

      // Validate index performance
      await this.validateIndexPerformance();

      // Verify schema creation
      await this.verifySchemaCreation();
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      this.results.errors.push(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await this.connection.disconnect();
      this.printResults();
    }

    return this.results;
  }

  /**
   * Print final results summary
   */
  private printResults(): void {
    console.log('📊 Schema Creation Results Summary');
    console.log('=================================');
    console.log(`✅ Constraints Created: ${this.results.constraintsCreated}`);
    console.log(`🚀 Indexes Created: ${this.results.indexesCreated}`);
    console.log(`✅ Validations Passed: ${this.results.validationsPassed}`);
    console.log(`❌ Validations Failed: ${this.results.validationsFailed}`);

    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.errors.forEach((error) => console.log(`   ${error}`));
    }

    const totalValidations = this.results.validationsPassed + this.results.validationsFailed;
    const successRate =
      totalValidations > 0 ? (this.results.validationsPassed / totalValidations) * 100 : 0;
    console.log(`\n🎯 Validation Success Rate: ${successRate.toFixed(1)}%`);

    if (this.results.validationsFailed === 0 && this.results.errors.length === 0) {
      console.log('\n🎉 Schema creation completed successfully!');
      console.log('✅ All constraints created without errors');
      console.log('✅ All indexes created for performance optimization');
      console.log('✅ Uniqueness constraints prevent duplicate instances');
      console.log('✅ Schema validation passed all tests');
    } else {
      console.log(
        '\n⚠️  Schema creation completed with some issues. Please review the errors above.'
      );
    }
  }
}

// Run schema creation if this script is executed directly
if (require.main === module) {
  const schemaCreator = new MCPServerConnectorSchemaCreator();
  schemaCreator.createSchema().catch(console.error);
}
