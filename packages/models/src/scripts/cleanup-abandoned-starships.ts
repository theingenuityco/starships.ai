#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { StarshipRepository } from '../repositories/StarshipRepository';

async function cleanupAbandonedStarships() {
  console.log('🧹 Starting cleanup of abandoned pending starships...');

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

    const starshipRepo = new StarshipRepository();

    // Find starships pending for more than 24 hours
    const abandonedStarships = await starshipRepo.findAbandonedPendingStarships(24);
    
    if (abandonedStarships.length === 0) {
      console.log('✨ No abandoned starships found');
      return;
    }

    console.log(`Found ${abandonedStarships.length} abandoned starships:`);
    
    for (const starship of abandonedStarships) {
      console.log(`  - ${starship.name} (ID: ${starship.id}, Created: ${starship.createdAt})`);
      
      // Optional: Check with Stripe if there's an active subscription
      // If you want to be extra safe, you could check Stripe here
      
      if (process.argv.includes('--dry-run')) {
        console.log('    [DRY RUN] Would delete this starship');
      } else {
        await starshipRepo.cleanupAbandonedStarship(starship.id);
        console.log('    ✅ Deleted');
      }
    }

    if (!process.argv.includes('--dry-run')) {
      console.log(`\n✅ Cleaned up ${abandonedStarships.length} abandoned starships`);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run if executed directly
if (require.main === module) {
  cleanupAbandonedStarships().catch(console.error);
}

export { cleanupAbandonedStarships };