#!/usr/bin/env tsx
/**
 * Script to manually update a starship's vision
 */

import { RepositoryFactory, createConnection, getConnection } from '@starships/models';
import neo4j from 'neo4j-driver';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function updateVision() {
  // Validate required environment variables
  if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) {
    console.error('❌ Missing required Neo4j environment variables');
    console.error('Please set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD');
    process.exit(1);
  }

  const neo4jConfig = {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
  };

  // Initialize Neo4j driver for RepositoryFactory
  const driver = neo4j.driver(
    neo4jConfig.uri,
    neo4j.auth.basic(neo4jConfig.username, neo4jConfig.password)
  );

  try {
    // Create and connect the connection
    const connection = createConnection(neo4jConfig);
    await connection.connect();
    console.log('✅ Neo4j connection established');

    // Then initialize repository factory (no driver needed)
    await RepositoryFactory.initialize();
    console.log('✅ Repository factory initialized');

    const visionRepo = RepositoryFactory.getVisionRepository();

    // The starship name from the chat is "Jumanji"
    // First, find the starship ID
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starships = await starshipRepo.findAll();
    const jumanji = starships.find((s) => s.name.toLowerCase() === 'jumanji');

    if (!jumanji) {
      console.error('❌ Starship "Jumanji" not found');
      process.exit(1);
    }

    console.log(`Found starship: ${jumanji.name} (ID: ${jumanji.id})`);

    // The new vision based on the chat
    const newVision =
      "Build the most innovative and sustainable starship to advance humanity's journey into space";

    // Update the vision
    const result = await visionRepo.updateStatement(jumanji.id, newVision);

    if (result) {
      console.log('✅ Vision updated successfully!');
      console.log(`Old vision: ${result.statement || 'N/A'}`);
      console.log(`New vision: ${newVision}`);
      console.log(`Refinement count: ${result.refinementCount}`);
    } else {
      // Create new vision if it doesn't exist
      await visionRepo.create({
        starshipId: jumanji.id,
        statement: newVision,
        refinementCount: 1,
        confidence: 0.8,
        lastRefined: new Date().toISOString(),
        isActive: true,
      });
      console.log('✅ Vision created successfully!');
    }
  } catch (error) {
    console.error('❌ Error updating vision:', error);
    process.exit(1);
  } finally {
    await driver.close();
    console.log('Connection closed');
  }
}

// Run the script
updateVision().catch(console.error);
