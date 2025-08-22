#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { StarshipRepository } from '../repositories/StarshipRepository';
import { UserRepository } from '../repositories/UserRepository';
import { Starship, User } from '../types';

/**
 * Test users to create for starship ownership
 */
const TEST_USERS: Omit<User, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    kindeId: 'test-captain-kinde',
    username: 'test-captain',
    email: 'captain@starships.test',
    displayName: 'Test Captain',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=captain',
    _aggregateRoot: true,
  },
  {
    kindeId: 'test-commander-kinde',
    username: 'test-commander',
    email: 'commander@starships.test',
    displayName: 'Test Commander',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=commander',
    _aggregateRoot: true,
  },
  {
    kindeId: 'test-user-1',
    username: 'test-user',
    email: 'test@starships.ai',
    displayName: 'Test User',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
    _aggregateRoot: true,
  },
];

/**
 * Test starships to seed in the database
 */
const TEST_STARSHIPS: Array<Omit<Starship, 'id' | 'createdAt' | 'updatedAt' | 'maxAgents' | 'maxActiveMissions' | 'slug'> & { ownerUsername: string }> = [
  {
    ownerUsername: 'test-captain',
    ownerId: '', // Will be populated from user
    class: 'scout',
    name: 'USS Discovery',
    status: 'active',
    _aggregateRoot: true,
  },
  {
    ownerUsername: 'test-captain',
    ownerId: '', // Will be populated from user
    class: 'cruiser',
    name: 'USS Enterprise',
    status: 'active',
    _aggregateRoot: true,
  },
  {
    ownerUsername: 'test-commander',
    ownerId: '', // Will be populated from user
    class: 'scout',
    name: 'USS Voyager',
    status: 'active',
    _aggregateRoot: true,
  },
  {
    ownerUsername: 'test-commander',
    ownerId: '', // Will be populated from user
    class: 'cruiser',
    name: 'USS Defiant',
    status: 'inactive',
    _aggregateRoot: true,
  },
  {
    ownerUsername: 'test-captain',
    ownerId: '', // Will be populated from user
    class: 'scout',
    name: 'USS Prometheus',
    status: 'active',
    _aggregateRoot: true,
  },
  {
    ownerUsername: 'test-user',
    ownerId: '', // Will be populated from user
    class: 'cruiser',
    name: 'API Test Ship',
    status: 'active',
    _aggregateRoot: true,
  },
];

async function seedStarships() {
  console.log('🚀 Starting Starship seeding...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    const userRepo = new UserRepository();
    const starshipRepo = new StarshipRepository();

    // Step 1: Create or verify test users exist
    console.log('👥 Creating test users...');
    const createdUsers: User[] = [];
    
    for (const userData of TEST_USERS) {
      try {
        // Check if user already exists
        const existingUser = await userRepo.findByUsername(userData.username);
        
        if (existingUser) {
          console.log(`  ✅ User already exists: ${existingUser.username} (${existingUser.id})`);
          createdUsers.push(existingUser);
        } else {
          // Create new user
          const newUser = await userRepo.create(userData);
          console.log(`  ✅ Created user: ${newUser.username} (${newUser.id})`);
          createdUsers.push(newUser);
        }
      } catch (error) {
        console.error(`  ❌ Failed to create user ${userData.username}:`, error);
        throw error;
      }
    }

    // Create user lookup map
    const userMap = new Map<string, User>();
    createdUsers.forEach(user => userMap.set(user.username, user));

    // Step 2: Check existing starships
    console.log('🛸 Checking existing starships...');
    const existingStarships = await starshipRepo.findAll();
    console.log(`📋 Found ${existingStarships.length} existing starships`);

    // Only add starships that don't already exist (by name and owner)
    const existingStarshipKeys = new Set(
      existingStarships.map(s => `${s.name}:${s.ownerId}`)
    );

    const starshipsToAdd = TEST_STARSHIPS.filter(s => {
      const user = userMap.get(s.ownerUsername);
      if (!user) {
        console.warn(`⚠️  User ${s.ownerUsername} not found, skipping starship ${s.name}`);
        return false;
      }
      const key = `${s.name}:${user.id}`;
      return !existingStarshipKeys.has(key);
    });

    if (starshipsToAdd.length === 0) {
      console.log('✅ All test starships already exist');
    } else {
      console.log(`➕ Adding ${starshipsToAdd.length} missing starships...`);

      // Step 3: Create starships
      for (const starshipData of starshipsToAdd) {
        try {
          const owner = userMap.get(starshipData.ownerUsername);
          if (!owner) {
            console.error(`  ❌ Owner ${starshipData.ownerUsername} not found for starship ${starshipData.name}`);
            continue;
          }

          const starshipToCreate = {
            ...starshipData,
            ownerId: owner.id,
          };
          
          // Remove the ownerUsername field as it's not part of the Starship interface
          const { ownerUsername, ...cleanStarshipData } = starshipToCreate;

          const created = await starshipRepo.create(cleanStarshipData);
          console.log(`  ✅ Created starship: ${created.name} (${created.class}) - ${created.id}`);
          console.log(`     Owner: ${owner.displayName} (${owner.username})`);
          console.log(`     Slug: ${created.slug}`);
          console.log(`     Max Agents: ${created.maxAgents}`);
        } catch (error) {
          console.error(`  ❌ Failed to create starship ${starshipData.name}:`, error);
        }
      }
    }

    // Step 4: Verify final count and display summary
    const finalStarships = await starshipRepo.findAll();
    console.log(`\n🎯 Seeding complete! Total starships: ${finalStarships.length}`);

    // Display summary by class
    const scoutCount = finalStarships.filter(s => s.class === 'scout').length;
    const cruiserCount = finalStarships.filter(s => s.class === 'cruiser').length;
    const activeCount = finalStarships.filter(s => s.status === 'active').length;
    const inactiveCount = finalStarships.filter(s => s.status === 'inactive').length;

    console.log('\n📊 Starship Fleet Summary:');
    console.log('==========================');
    console.log(`🔍 Scout Class: ${scoutCount}`);
    console.log(`🚢 Cruiser Class: ${cruiserCount}`);
    console.log(`🟢 Active: ${activeCount}`);
    console.log(`🔴 Inactive: ${inactiveCount}`);

    console.log('\n🛸 Available Starships:');
    console.log('=======================');
    finalStarships.forEach((starship, index) => {
      const statusIcon = starship.status === 'active' ? '🟢' : '🔴';
      const classIcon = starship.class === 'scout' ? '🔍' : '🚢';
      console.log(`${index + 1}. ${statusIcon} ${classIcon} ${starship.name} (${starship.slug})`);
      console.log(`   Owner ID: ${starship.ownerId}`);
      console.log(`   Max Agents: ${starship.maxAgents}`);
    });

    // Step 5: Display test information for API testing
    console.log('\n🧪 Test Data for API Testing:');
    console.log('==============================');
    const testStarship = finalStarships.find(s => s.status === 'active');
    if (testStarship) {
      console.log(`✅ Primary Test Starship: ${testStarship.name}`);
      console.log(`   ID: ${testStarship.id}`);
      console.log(`   Slug: ${testStarship.slug}`);
      console.log(`   Owner ID: ${testStarship.ownerId}`);
      console.log(`   Class: ${testStarship.class}`);
      console.log(`   Status: ${testStarship.status}`);
      console.log('\n📝 API Test Commands:');
      console.log(`   GET /api/starships/${testStarship.id}`);
      console.log(`   GET /api/starships/${testStarship.id}/agents`);
    }

    console.log('\n🎉 Starship seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run seeding if this script is executed directly
if (require.main === module) {
  seedStarships().catch(console.error);
}

export { seedStarships, TEST_STARSHIPS, TEST_USERS };