#!/usr/bin/env ts-node

/**
 * Fix the ParameterPattern unique constraint
 * Drops the regular index and creates a unique constraint instead
 */

import { createConnection, Neo4jConfig } from '../connection';

async function fixUniqueConstraint() {
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };
  
  const connection = createConnection(config);
  await connection.connect();
  
  console.log('🔧 Fixing ParameterPattern unique constraint...\n');
  
  try {
    // Step 1: Drop the existing composite index
    console.log('1️⃣  Dropping existing composite index on (toolId, inputHash)...');
    try {
      await connection.executeWrite(`
        DROP INDEX pattern_lookup
      `);
      console.log('   ✅ Index dropped successfully');
    } catch (error: any) {
      if (error.message?.includes('No such index')) {
        console.log('   ℹ️  Index already dropped or doesn\'t exist');
      } else {
        console.log('   ⚠️  Could not drop index:', error.message);
      }
    }
    
    // Step 2: Create unique constraint
    console.log('\n2️⃣  Creating unique constraint on (toolId, inputHash)...');
    try {
      await connection.executeWrite(`
        CREATE CONSTRAINT pattern_unique_toolhash IF NOT EXISTS 
        FOR (p:ParameterPattern) 
        REQUIRE (p.toolId, p.inputHash) IS UNIQUE
      `);
      console.log('   ✅ Unique constraint created successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('   ℹ️  Unique constraint already exists');
      } else {
        throw error;
      }
    }
    
    // Step 3: Verify the constraint
    console.log('\n3️⃣  Verifying constraints...');
    const constraints = await connection.executeQuery(`
      SHOW CONSTRAINTS
      WHERE entityType = 'NODE' AND labelsOrTypes = ['ParameterPattern']
    `);
    
    console.log('   Current ParameterPattern constraints:');
    constraints.forEach((c: any) => {
      const props = Array.isArray(c.properties) ? c.properties.join(', ') : c.properties;
      console.log(`   - ${c.name}: ${props}`);
    });
    
    // Step 4: Show current patterns
    console.log('\n4️⃣  Current pattern statistics:');
    const stats = await connection.executeQuery(`
      MATCH (p:ParameterPattern)
      RETURN count(p) as total,
             count(DISTINCT p.toolId) as tools,
             count(DISTINCT p.inputHash) as uniqueHashes
    `);
    
    const total = stats[0]?.total?.low || stats[0]?.total || 0;
    const tools = stats[0]?.tools?.low || stats[0]?.tools || 0;
    const hashes = stats[0]?.uniqueHashes?.low || stats[0]?.uniqueHashes || 0;
    
    console.log(`   Total patterns: ${total}`);
    console.log(`   Unique tools: ${tools}`);
    console.log(`   Unique input hashes: ${hashes}`);
    
    console.log('\n✅ Constraint fix completed!');
    console.log('   Duplicates will now be prevented at the database level.');
    
  } catch (error) {
    console.error('❌ Error fixing constraint:', error);
    throw error;
  } finally {
    await connection.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  fixUniqueConstraint()
    .then(() => console.log('\n🎉 Done!'))
    .catch(error => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { fixUniqueConstraint };