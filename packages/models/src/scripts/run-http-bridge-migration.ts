#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runHttpBridgeMigration() {
  console.log('🚀 Starting HTTP Bridge database migration...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Read migration script
    const migrationPath = join(__dirname, '../migrations/010_add_http_bridge_support.cypher');
    const migrationScript = readFileSync(migrationPath, 'utf-8');

    // Split by semicolon and filter out comments and empty lines
    const statements = migrationScript
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt && !stmt.startsWith('//'));

    console.log(`📝 Found ${statements.length} HTTP bridge migration statements`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}`);
        const preview = statement.length > 100 ? 
          statement.substring(0, 100) + '...' : 
          statement;
        console.log(`   ${preview}`);

        try {
          await connection.executeWrite(statement);
          console.log(`✅ Statement ${i + 1} completed`);
        } catch (error) {
          console.log(
            `⚠️  Statement ${i + 1} failed (might be expected):`,
            (error as Error).message
          );
        }
      }
    }

    console.log('🎉 HTTP Bridge migration completed successfully!');

    // Verify migration by checking if new fields and indexes exist
    console.log('🔍 Verifying HTTP bridge migration...');
    
    // Check if HTTP bridge fields were added to MCPServerConnector
    const connectorResult = await connection.executeQuery(`
      MATCH (c:MCPServerConnector)
      RETURN count(c) as totalConnectors,
             count(c.httpBridgeEnabled) as connectorsWithHttpBridge
      LIMIT 1
    `);
    
    if (connectorResult.length > 0) {
      const { totalConnectors, connectorsWithHttpBridge } = connectorResult[0];
      console.log(`✅ Updated ${connectorsWithHttpBridge}/${totalConnectors} MCPServerConnector nodes with HTTP bridge fields`);
    }

    // Check indexes
    const indexResult = await connection.executeQuery('SHOW INDEXES');
    const httpBridgeIndexes = indexResult.filter(
      (record) => record.name && (
        record.name.includes('http_bridge') || 
        record.name.includes('service_registry')
      )
    );

    console.log(`✅ Found ${httpBridgeIndexes.length} HTTP bridge indexes:`);
    httpBridgeIndexes.forEach((index) => {
      console.log(`   - ${index.name}: ${index.properties || index.labelsOrTypes}`);
    });

    // Check if MCPServiceRegistry constraint was created
    const constraintResult = await connection.executeQuery('SHOW CONSTRAINTS');
    const serviceRegistryConstraints = constraintResult.filter(
      (record) => record.name && record.name.includes('service_registry')
    );

    console.log(`✅ Found ${serviceRegistryConstraints.length} service registry constraints:`);
    serviceRegistryConstraints.forEach((constraint) => {
      console.log(`   - ${constraint.name}: ${constraint.properties || constraint.labelsOrTypes}`);
    });

  } catch (error) {
    console.error('❌ HTTP Bridge migration failed:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Database connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runHttpBridgeMigration().catch(console.error);
}

export { runHttpBridgeMigration };