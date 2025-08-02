#!/usr/bin/env tsx

import { createConnection } from '../connection';

async function cleanupDuplicateLLMs() {
  console.log('🧹 Starting cleanup of duplicate LLM models...');
  
  const connection = createConnection({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');
    
    // First, let's see what we have
    const allModels = await connection.executeQuery<{ l: any }>(
      'MATCH (l:LLM) RETURN l ORDER BY l.name, l.createdAt'
    );
    
    console.log(`\n📊 Found ${allModels.length} total LLM nodes`);
    
    // Group by name to find duplicates
    const modelsByName = new Map<string, any[]>();
    for (const record of allModels) {
      const model = record.l;
      const name = model.name;
      if (!modelsByName.has(name)) {
        modelsByName.set(name, []);
      }
      modelsByName.get(name)!.push(model);
    }
    
    console.log('\n🔍 Duplicate analysis:');
    let totalDuplicates = 0;
    for (const [name, models] of modelsByName) {
      if (models.length > 1) {
        console.log(`  - ${name}: ${models.length} copies`);
        totalDuplicates += models.length - 1;
      }
    }
    
    if (totalDuplicates === 0) {
      console.log('✅ No duplicates found!');
      return;
    }
    
    console.log(`\n⚠️  Found ${totalDuplicates} duplicate nodes to remove`);
    console.log('🗑️  Removing duplicates (keeping the oldest one for each model)...\n');
    
    // Remove duplicates, keeping the oldest one
    for (const [name, models] of modelsByName) {
      if (models.length > 1) {
        // Sort by createdAt (oldest first) or by ID if createdAt is not available
        models.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          return a.id.localeCompare(b.id);
        });
        
        const toKeep = models[0];
        const toDelete = models.slice(1);
        
        console.log(`  Keeping ${name} (ID: ${toKeep.id})`);
        
        for (const model of toDelete) {
          try {
            // Check if this model is referenced by any agents
            const agentCount = await connection.executeQuery<{ count: number }>(
              'MATCH (a:Agent) WHERE a.model = $modelId RETURN count(a) as count',
              { modelId: model.id }
            );
            
            if (agentCount[0]?.count > 0) {
              console.log(`    ⚠️  Cannot delete ${model.id} - referenced by ${agentCount[0].count} agents`);
              // Update agents to use the kept model
              await connection.executeWrite(
                'MATCH (a:Agent) WHERE a.model = $oldId SET a.model = $newId',
                { oldId: model.id, newId: toKeep.id }
              );
              console.log(`    ✅ Updated ${agentCount[0].count} agents to use ${toKeep.id}`);
            }
            
            // Now safe to delete
            await connection.executeWrite(
              'MATCH (l:LLM) WHERE l.id = $id DELETE l',
              { id: model.id }
            );
            console.log(`    🗑️  Deleted duplicate ${model.id}`);
          } catch (error) {
            console.error(`    ❌ Failed to delete ${model.id}:`, error);
          }
        }
      }
    }
    
    // Verify final count
    const finalCount = await connection.executeQuery<{ count: number }>(
      'MATCH (l:LLM) RETURN count(l) as count'
    );
    
    console.log(`\n✅ Cleanup complete! Final LLM count: ${finalCount[0].count}`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run if this script is executed directly
if (require.main === module) {
  cleanupDuplicateLLMs()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { cleanupDuplicateLLMs };