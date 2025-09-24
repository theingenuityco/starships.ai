/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { createConnection, type Neo4jConfig } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ALL_AGENT_TEMPLATES } from '@/seeders/agents';

/**
 * Seeds the database with default agent templates
 * This runs when explicitly called, not on every server startup
 */
export async function seedAgentTemplates(): Promise<void> {
  try {
    logger.info('Starting agent template seeding...');

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

    // Create the agent template repository
    const templateRepo = new AgentTemplateRepository(connection);

    logger.info('Seeding database with default agent templates...');

    let addedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const template of ALL_AGENT_TEMPLATES) {
      try {
        // Check if template already exists by slug - more reliable than name search
        const existingTemplate = await templateRepo.findBySlug(template.slug as string);

        if (existingTemplate) {
          // Force-update blueprint and state so agent logic/template fixes are applied
          await templateRepo.update(existingTemplate.id, {
            blueprint: template.blueprint,
            systemPrompt: template.systemPrompt,
            state: template.state,
            model: template.model,
            temperature: template.temperature,
            maxTokens: template.maxTokens,
            timeout: template.timeout,
            description: template.description,
            icon: template.icon,
            previewPrompts: template.previewPrompts,
            category: template.category,
            name: template.name,
            // Important: ensure assignedToolSlugs relationships are refreshed on updates
            assignedToolSlugs: template.assignedToolSlugs,
          });
          existingCount++;
          logger.info(`Agent template updated: ${template.name} (slug: ${template.slug})`);
        } else {
          // Create the template - explicitly construct payload with slug
          const payload = {
            name: template.name,
            slug: template.slug, // Ensure explicit slug is passed
            description: template.description,
            category: template.category,
            model: template.model,
            temperature: template.temperature,
            maxTokens: template.maxTokens,
            timeout: template.timeout,
            icon: template.icon,
            previewPrompts: template.previewPrompts,
            blueprint: template.blueprint,
            systemPrompt: template.systemPrompt,
            state: template.state,
            assignedToolSlugs: template.assignedToolSlugs,
          };
          await templateRepo.create(payload);
          addedCount++;
          logger.info(`Agent template created: ${template.name} (slug: ${template.slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(
          `Agent template error processing ${template.name} (slug: ${template.slug}): ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    logger.info(`✅ Agent template seeding completed: ${addedCount} new, ${existingCount} existing, ${errorCount} errors`);
    
    // Close connection when running as script
    if (require.main === module) {
      await connection.disconnect();
    }
  } catch (error) {
    logger.error(`Failed to seed agent templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      logger.error('Agent template seeding error details', {
        stack: error.stack || 'No stack trace available',
      });
    }
    // Don't throw - we don't want to prevent server startup if template seeding fails
  }
}

// Allow running as standalone script
if (require.main === module) {
  // Load environment variables
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
  
  seedAgentTemplates()
    .then(() => {
      console.log('✅ Agent template seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed agent templates:', error);
      process.exit(1);
    });
}
