const neo4j = require('neo4j-driver');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, 'packages/models/.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'neo4j://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

async function checkWikipedia() {
  const session = driver.session();
  try {
    // Check tool template
    const result = await session.run(
      'MATCH (tt:ToolTemplate {slug: "wikipedia-search"}) RETURN tt.blueprint as blueprint LIMIT 1'
    );
    
    if (result.records.length > 0) {
      const blueprint = JSON.parse(result.records[0].get('blueprint'));
      const prepareNode = blueprint.nodes.find(n => n.ref === 'prepare_request');
      
      console.log('Current mutation path in DB:');
      if (prepareNode?.parameters?.mutations?.[0]) {
        console.log('  Path:', prepareNode.parameters.mutations[0].path);
        console.log('  Starts with /state?', prepareNode.parameters.mutations[0].path.startsWith('/state'));
      } else {
        console.log('  No mutations found');
      }
      
      // Check tool instance too
      const instanceResult = await session.run(
        'MATCH (t:Tool {slug: "wikipedia-search"}) RETURN t.blueprint as blueprint LIMIT 1'
      );
      
      if (instanceResult.records.length > 0) {
        const instanceBlueprint = JSON.parse(instanceResult.records[0].get('blueprint'));
        const instancePrepareNode = instanceBlueprint.nodes.find(n => n.ref === 'prepare_request');
        
        console.log('\nTool instance mutation path:');
        if (instancePrepareNode?.parameters?.mutations?.[0]) {
          console.log('  Path:', instancePrepareNode.parameters.mutations[0].path);
          console.log('  Starts with /state?', instancePrepareNode.parameters.mutations[0].path.startsWith('/state'));
        } else {
          console.log('  No mutations found');
        }
      }
      
      // If the path is wrong, fix it
      if (prepareNode?.parameters?.mutations?.[0]?.path === '/wikipedia_metadata') {
        console.log('\n🔧 Fixing mutation path...');
        prepareNode.parameters.mutations[0].path = '/state/wikipedia_metadata';
        
        // Update both template and instance
        await session.run(
          'MATCH (tt:ToolTemplate {slug: "wikipedia-search"}) SET tt.blueprint = $blueprint RETURN COUNT(tt) as count',
          { blueprint: JSON.stringify(blueprint) }
        );
        
        await session.run(
          'MATCH (t:Tool {slug: "wikipedia-search"}) SET t.blueprint = $blueprint RETURN COUNT(t) as count',
          { blueprint: JSON.stringify(blueprint) }
        );
        
        console.log('✅ Fixed mutation path in database');
      }
    } else {
      console.log('No Wikipedia tool template found');
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

checkWikipedia().catch(console.error);