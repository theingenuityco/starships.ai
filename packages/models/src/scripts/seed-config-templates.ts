#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { ConnectorConfigTemplateRepository } from '../repositories/ConnectorConfigTemplateRepository';
import { BUILTIN_CONFIG_TEMPLATES } from '../types';

/**
 * Seed built-in configuration templates
 */
async function seedConfigTemplates() {
  console.log('🌱 Starting configuration template seeding...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    const templateRepo = new ConnectorConfigTemplateRepository();

    // Check if templates already exist
    const existingTemplates = await templateRepo.findAll();
    console.log(`📊 Found ${existingTemplates.length} existing templates`);

    // Only add templates that don't already exist (by name)
    const existingNames = new Set(existingTemplates.map((t) => t.name));
    const templatesToAdd = BUILTIN_CONFIG_TEMPLATES.filter((t) => !existingNames.has(t.name));

    if (templatesToAdd.length === 0) {
      console.log('✅ All built-in configuration templates already exist');
      return;
    }

    console.log(`➕ Adding ${templatesToAdd.length} missing configuration templates...`);

    // Create built-in templates
    for (const templateData of templatesToAdd) {
      try {
        console.log(`➕ Creating template: ${templateData.name}`);

        const template = await templateRepo.create({
          name: templateData.name,
          description: templateData.description,
          category: templateData.category,
          tags: templateData.tags,
          config: templateData.config,
          isPublic: templateData.isPublic,
          authorId: 'system', // System-created templates
          usageCount: 0,
        });

        console.log(`  ✅ Created template: ${template.name} (${template.id})`);
      } catch (error) {
        console.error(`  ❌ Failed to create template ${templateData.name}:`, error);
      }
    }

    // Verify final count
    const finalTemplates = await templateRepo.findAll();
    console.log(`\n🎯 Seeding complete! Total configuration templates: ${finalTemplates.length}`);

    // Display summary
    console.log('\n📊 Available Configuration Templates:');
    console.log('====================================');
    finalTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.category})`);
    });

    console.log('🎉 Configuration template seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding configuration templates:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('🔌 Database connection closed');
  }
}

// Run the seeding if this script is executed directly
if (require.main === module) {
  seedConfigTemplates().catch(console.error);
}

export { seedConfigTemplates };
