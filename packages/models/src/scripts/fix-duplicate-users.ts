#!/usr/bin/env tsx

import neo4j from 'neo4j-driver';

async function fixDuplicateUsers() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME || 'neo4j',
      process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]'
    )
  );

  const session = driver.session();

  try {
    console.log('🔍 Finding duplicate users...');
    
    // Find all duplicate kindeIds
    const duplicatesResult = await session.run(`
      MATCH (u:User)
      WITH u.kindeId as kindeId, collect(u) as users, count(*) as userCount
      WHERE userCount > 1
      RETURN kindeId, userCount, [user in users | id(user)] as nodeIds
    `);

    if (duplicatesResult.records.length === 0) {
      console.log('✅ No duplicate users found!');
      return;
    }

    console.log(`Found ${duplicatesResult.records.length} duplicate kindeId(s)`);

    for (const record of duplicatesResult.records) {
      const kindeId = record.get('kindeId');
      const nodeIds = record.get('nodeIds');
      const userCount = record.get('userCount').toNumber();
      
      console.log(`\n📋 KindeId: ${kindeId}`);
      console.log(`   Duplicate count: ${userCount}`);
      console.log(`   Node IDs: ${nodeIds.join(', ')}`);
      
      // Keep the first node, delete the rest
      const nodesToDelete = nodeIds.slice(1);
      
      for (const nodeId of nodesToDelete) {
        // First, delete all relationships for this node
        await session.run(`
          MATCH (u:User) WHERE id(u) = $nodeId
          DETACH DELETE u
        `, { nodeId: neo4j.int(nodeId) });
        
        console.log(`   ❌ Deleted duplicate node ${nodeId}`);
      }
      
      console.log(`   ✅ Kept original node ${nodeIds[0]}`);
    }

    console.log('\n✨ Successfully cleaned up all duplicate users!');

  } catch (error) {
    console.error('❌ Error fixing duplicate users:', error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  fixDuplicateUsers()
    .then(() => {
      console.log('✅ Duplicate user cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Duplicate user cleanup failed:', error);
      process.exit(1);
    });
}

export { fixDuplicateUsers };