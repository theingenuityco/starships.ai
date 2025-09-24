/**
 * Seed Tool Templates
 * Creates default tool templates available for agents and marketplace
 */

import { createConnection, type Neo4jConfig } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import { generateSlug } from '@/helpers/slugUtils';
import type { CreateToolTemplateRequest } from '@starships/protocol';
import { ALL_TOOL_TEMPLATES } from '@/seeders/tools';

/**
 * Seeds the database with default tool templates
 * Safe to run multiple times (idempotent via slug upsert behavior)
 */
export async function seedToolTemplates(): Promise<void> {
  try {
    logger.info('Starting tool template seeding...');

    // Create database connection - require environment variables
    if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) {
      throw new Error('Missing required environment variables: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
    }
    
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI,
      username: process.env.NEO4J_USERNAME,
      password: process.env.NEO4J_PASSWORD,
      database: process.env.NEO4J_DATABASE
    };
    
    const connection = createConnection(config);
    await connection.connect();

    // Create repository
    const toolTemplateRepo = new ToolTemplateRepository(connection);

    logger.info('Seeding database with default tool templates...');

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const template of ALL_TOOL_TEMPLATES) {
      try {
        // Prefer explicit slug if present; otherwise generate from name
        const slug = template.slug || generateSlug(template.name);

        const existing = await toolTemplateRepo.findBySlug(slug);

        if (existing) {
          // Update core fields to propagate any fixes or improvements
          await toolTemplateRepo.update(existing.id, {
            name: template.name,
            description: template.description,
            parameters: template.parameters,
            blueprint: template.blueprint,
            category: template.category,
            exampleUsage: template.exampleUsage,
            requiresApiKey: template.requiresApiKey,
            configurationFields: template.configurationFields,
          });
          updatedCount++;
          logger.info(`Tool template updated: ${template.name} (slug: ${slug})`);
        } else {
          // Create new template
          const payload: CreateToolTemplateRequest = {
            name: template.name,
            slug: slug, // Include the explicit or generated slug
            description: template.description,
            parameters: template.parameters,
            category: template.category,
            exampleUsage: template.exampleUsage,
            requiresApiKey: template.requiresApiKey,
            configurationFields: template.configurationFields,
            blueprint: template.blueprint,
          };
          await toolTemplateRepo.create(payload);
          addedCount++;
          logger.info(`Tool template created: ${template.name} (slug: ${slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(`Tool template error processing ${template.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`✅ Tool template seeding completed: ${addedCount} new, ${updatedCount} updated, ${errorCount} errors`);
    
    // Close connection when running as script
    if (require.main === module) {
      await connection.disconnect();
    }
  } catch (error) {
    logger.error(`Failed to seed tool templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      logger.error('Tool template seeding error details', {
        stack: error.stack || 'No stack trace available',
      });
    }
    // Do not throw; seeding failure should not block startup
  }
}

// Allow running as standalone script
if (require.main === module) {
  // Load environment variables
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
  
  seedToolTemplates()
    .then(() => {
      console.log('✅ Tool template seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed tool templates:', error);
      process.exit(1);
    });
}
