#!/usr/bin/env tsx

import { createConnection, PostgresConfig } from '@/helpers/database';
import { StarshipRepository } from '@/repositories/StarshipRepository';

async function cleanupAbandonedStarships() {
  console.log('🧹 Starting cleanup of abandoned pending starships...');

  // Validate required environment variables
  if (!process.env.POSTGRES_HOST || !process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD) {
    console.error('❌ Missing required PostgreSQL environment variables');
    console.error('Please set POSTGRES_HOST, POSTGRES_USER, and POSTGRES_PASSWORD');
    process.exit(1);
  }

  const config: PostgresConfig = {
    host: process.env.POSTGRES_HOST!,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DATABASE || 'starships',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to PostgreSQL');

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
