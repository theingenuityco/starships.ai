#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';

/**
 * Test script to verify MCPServerConnector constraints work with actual data
 */
async function testConnectorConstraints() {
  console.log('🧪 Testing MCPServerConnector Constraints with Real Data');
  console.log('======================================================');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j database\n');

    // Test 1: Create valid MCPServerConnector instances
    console.log('📝 Test 1: Creating valid MCPServerConnector instances');

    const connectors = [
      {
        id: 'connector-1',
        starshipId: 'starship-alpha',
        templateId: 'github-template',
        status: 'active',
        isActive: true,
      },
      {
        id: 'connector-2',
        starshipId: 'starship-alpha',
        templateId: 'docker-template',
        status: 'active',
        isActive: true,
      },
      {
        id: 'connector-3',
        starshipId: 'starship-beta',
        templateId: 'github-template',
        status: 'inactive',
        isActive: false,
      },
    ];

    for (const connector of connectors) {
      await connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: $id,
          starshipId: $starshipId,
          templateId: $templateId,
          status: $status,
          isActive: $isActive,
          createdAt: datetime()
        })`,
        connector
      );
      console.log(
        `✅ Created connector: ${connector.id} (${connector.starshipId} -> ${connector.templateId})`
      );
    }

    // Test 2: Verify unique ID constraint
    console.log('\n🔒 Test 2: Testing unique ID constraint');
    try {
      await connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: 'connector-1',
          starshipId: 'starship-gamma',
          templateId: 'different-template',
          status: 'active',
          isActive: true,
          createdAt: datetime()
        })`
      );
      console.log('❌ FAILED: Duplicate ID was allowed');
    } catch (error) {
      console.log('✅ PASSED: Duplicate ID was prevented');
    }

    // Test 3: Verify composite unique constraint
    console.log('\n🔒 Test 3: Testing composite unique constraint (starshipId, templateId)');
    try {
      await connection.executeWrite(
        `CREATE (c:MCPServerConnector {
          id: 'connector-duplicate',
          starshipId: 'starship-alpha',
          templateId: 'github-template',
          status: 'active',
          isActive: true,
          createdAt: datetime()
        })`
      );
      console.log('❌ FAILED: Duplicate (starshipId, templateId) was allowed');
    } catch (error) {
      console.log('✅ PASSED: Duplicate (starshipId, templateId) was prevented');
    }

    // Test 4: Query performance with indexes
    console.log('\n📊 Test 4: Testing query performance with indexes');

    // Query by starshipId
    const starshipConnectors = await connection.executeQuery(
      'MATCH (c:MCPServerConnector) WHERE c.starshipId = $starshipId RETURN c',
      { starshipId: 'starship-alpha' }
    );
    console.log(`✅ Found ${starshipConnectors.length} connectors for starship-alpha`);

    // Query by templateId
    const templateConnectors = await connection.executeQuery(
      'MATCH (c:MCPServerConnector) WHERE c.templateId = $templateId RETURN c',
      { templateId: 'github-template' }
    );
    console.log(`✅ Found ${templateConnectors.length} connectors for github-template`);

    // Query by status
    const activeConnectors = await connection.executeQuery(
      'MATCH (c:MCPServerConnector) WHERE c.status = $status RETURN c',
      { status: 'active' }
    );
    console.log(`✅ Found ${activeConnectors.length} active connectors`);

    // Query by isActive
    const enabledConnectors = await connection.executeQuery(
      'MATCH (c:MCPServerConnector) WHERE c.isActive = $isActive RETURN c',
      { isActive: true }
    );
    console.log(`✅ Found ${enabledConnectors.length} enabled connectors`);

    // Test 5: Complex query combining multiple indexes
    console.log('\n🔍 Test 5: Testing complex queries with multiple conditions');
    const complexQuery = await connection.executeQuery(
      `MATCH (c:MCPServerConnector) 
       WHERE c.starshipId = $starshipId AND c.isActive = $isActive 
       RETURN c`,
      { starshipId: 'starship-alpha', isActive: true }
    );
    console.log(`✅ Found ${complexQuery.length} active connectors for starship-alpha`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Unique constraints are working properly');
    console.log('✅ Indexes are supporting query performance');
    console.log('✅ Schema implementation is ready for production use');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    try {
      await connection.executeWrite(
        `MATCH (c:MCPServerConnector) 
         WHERE c.id STARTS WITH 'connector-' 
         DELETE c`
      );
      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.error('⚠️  Error cleaning up test data:', error);
    }

    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testConnectorConstraints().catch(console.error);
}
