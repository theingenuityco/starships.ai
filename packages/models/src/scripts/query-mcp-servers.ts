#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';

async function queryMCPServers() {
  console.log('🔍 Querying MCPServerOption nodes from Neo4j...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Query MCPServerOption nodes
    console.log('📋 Executing: MATCH (n:MCPServerOption) RETURN n LIMIT 25');
    const mcpServers = await connection.executeQuery('MATCH (n:MCPServerOption) RETURN n LIMIT 25');

    console.log(`\n🎯 Found ${mcpServers.length} MCPServerOption nodes:`);
    console.log('=====================================');

    if (mcpServers.length === 0) {
      console.log('❌ No MCPServerOption nodes found in the database');
      return;
    }

    // Display the structure of each node
    mcpServers.forEach((record, index) => {
      console.log(`\n📦 Node ${index + 1}:`);
      console.log(JSON.stringify(record.n, null, 2));
    });

    // Extract unique properties across all nodes
    const allProperties = new Set<string>();
    mcpServers.forEach((record) => {
      if (record.n && typeof record.n === 'object') {
        Object.keys(record.n).forEach((key) => allProperties.add(key));
      }
    });

    console.log('\n🔧 Unique properties found across all MCPServerOption nodes:');
    console.log('=======================================================');
    Array.from(allProperties)
      .sort()
      .forEach((prop) => {
        console.log(`  - ${prop}`);
      });

    // Generate TypeScript interface suggestion
    console.log('\n💡 Suggested TypeScript interface:');
    console.log('===================================');
    console.log('export interface MCPServerOption {');

    // Analyze property types from first node
    if (mcpServers[0]?.n) {
      const sampleNode = mcpServers[0].n;
      Array.from(allProperties)
        .sort()
        .forEach((prop) => {
          const value = sampleNode[prop];
          let type = 'any';

          if (value === null || value === undefined) {
            type = 'string | null';
          } else if (typeof value === 'string') {
            type = 'string';
          } else if (typeof value === 'number') {
            type = 'number';
          } else if (typeof value === 'boolean') {
            type = 'boolean';
          } else if (Array.isArray(value)) {
            type = 'string[]'; // Assume string array for now
          } else if (typeof value === 'object') {
            type = 'Record<string, any>';
          }

          console.log(`  ${prop}: ${type};`);
        });
    }

    console.log('}');

    // Check for any relationships
    console.log('\n🔗 Checking for relationships...');
    const relationships = await connection.executeQuery(`
      MATCH (n:MCPServerOption)-[r]->(m)
      RETURN type(r) as relationshipType, labels(m) as targetLabels, null as sourceLabels, count(*) as count
      UNION
      MATCH (n:MCPServerOption)<-[r]-(m)
      RETURN type(r) as relationshipType, null as targetLabels, labels(m) as sourceLabels, count(*) as count
    `);

    if (relationships.length > 0) {
      console.log('Found relationships:');
      relationships.forEach((rel) => {
        console.log(`  - ${rel.relationshipType}: ${rel.count} connections`);
        if (rel.targetLabels) console.log(`    -> ${rel.targetLabels.join(', ')}`);
        if (rel.sourceLabels) console.log(`    <- ${rel.sourceLabels.join(', ')}`);
      });
    } else {
      console.log('No relationships found for MCPServerOption nodes');
    }
  } catch (error) {
    console.error('❌ Query failed:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run query if this script is executed directly
if (require.main === module) {
  queryMCPServers().catch(console.error);
}

export { queryMCPServers };
