#!/usr/bin/env ts-node

/**
 * Clean up duplicate ParameterPattern nodes in Neo4j
 */

import { createConnection, Neo4jConfig } from '../connection';

async function cleanupDuplicates() {
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };
  
  const connection = createConnection(config);
  await connection.connect();
  
  console.log('🧹 Starting cleanup of duplicate ParameterPattern nodes...\n');
  
  try {
    // Get initial count
    const beforeCount = await connection.executeQuery(`
      MATCH (p:ParameterPattern)
      RETURN count(p) as total
    `);
    const beforeTotal = beforeCount[0]?.total?.low || beforeCount[0]?.total || 0;
    console.log(`📊 Total patterns before cleanup: ${beforeTotal}`);
    
    // Find duplicates
    const duplicates = await connection.executeQuery(`
      MATCH (p:ParameterPattern)
      WITH p.toolId as toolId, p.inputHash as hash, collect(p) as patterns, count(p) as count
      WHERE count > 1
      RETURN toolId, hash, count, patterns
      ORDER BY count DESC
    `);
    
    if (duplicates.length === 0) {
      console.log('\n✅ No duplicates found!');
      await connection.disconnect();
      return;
    }
    
    console.log(`\n⚠️  Found ${duplicates.length} groups of duplicates`);
    
    // Delete duplicates, keeping the one with highest successCount
    let totalDeleted = 0;
    
    for (const dup of duplicates) {
      const toolId = dup.toolId;
      const hash = dup.hash;
      const count = dup.count?.low || dup.count || 0;
      
      // Delete all but the one with highest successCount
      const deleteResult = await connection.executeWrite(`
        MATCH (p:ParameterPattern {toolId: $toolId, inputHash: $hash})
        WITH p ORDER BY p.successCount DESC
        WITH collect(p) as allPatterns
        FOREACH (p IN tail(allPatterns) | DELETE p)
        RETURN size(allPatterns) - 1 as deleted
      `, { toolId, hash });
      
      const deleted = deleteResult[0]?.deleted?.low || deleteResult[0]?.deleted || 0;
      totalDeleted += deleted;
      console.log(`  Removed ${deleted} duplicates for ${toolId} (hash: ${hash})`);
    }
    
    console.log(`\n✅ Total duplicates removed: ${totalDeleted}`);
    
    // Final count
    const afterCount = await connection.executeQuery(`
      MATCH (p:ParameterPattern)
      RETURN count(p) as total
    `);
    const afterTotal = afterCount[0]?.total?.low || afterCount[0]?.total || 0;
    console.log(`\n📊 Total patterns after cleanup: ${afterTotal}`);
    console.log(`   Reduction: ${beforeTotal - afterTotal} nodes`);
    
    // Verify no duplicates remain
    const checkDuplicates = await connection.executeQuery(`
      MATCH (p:ParameterPattern)
      WITH p.toolId as toolId, p.inputHash as hash, count(p) as count
      WHERE count > 1
      RETURN count(*) as remaining
    `);
    
    const remaining = checkDuplicates[0]?.remaining?.low || checkDuplicates[0]?.remaining || 0;
    if (remaining > 0) {
      console.log(`\n⚠️  Warning: ${remaining} duplicate groups still remain`);
    } else {
      console.log('\n✅ All duplicates successfully removed!');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await connection.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  cleanupDuplicates()
    .then(() => console.log('\n🎉 Cleanup completed!'))
    .catch(error => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

export { cleanupDuplicates };