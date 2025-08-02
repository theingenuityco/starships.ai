#!/usr/bin/env tsx

import { createConnection } from '../connection';

async function queryLLMModels() {
  console.log('🔍 Querying LLMModel nodes from Neo4j...');
  
  const connection = createConnection({
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');
    
    const query = `
      MATCH (n:LLMModel) 
      RETURN n
      ORDER BY n.provider, n.name
    `;
    
    console.log('📋 Executing query to find all LLM models...\n');
    
    const result = await connection.executeQuery(query, {});
    
    console.log(`🎯 Found ${result.length} LLMModel nodes:`);
    console.log('=====================================\n');
    
    // Group by provider
    const modelsByProvider = result.reduce((acc: any, record: any) => {
      const model = record.n;
      const provider = model.provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {});
    
    // Display models grouped by provider
    Object.keys(modelsByProvider).sort().forEach(provider => {
      console.log(`📦 Provider: ${provider}`);
      console.log('-------------------');
      modelsByProvider[provider].forEach((model: any) => {
        console.log(`  • ${model.name} (${model.model})`);
        console.log(`    ID: ${model.id}`);
        if (model.description) {
          console.log(`    Description: ${model.description}`);
        }
      });
      console.log();
    });
    
  } catch (error) {
    console.error('❌ Error querying Neo4j:', error);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run if this script is executed directly
if (require.main === module) {
  queryLLMModels()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { queryLLMModels };