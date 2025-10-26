/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ALL_AGENT_TEMPLATES } from '@/seeders/agents';

/**
 * Seeds the database with default agent templates
 * Safe to run multiple times - skips existing templates to avoid overwriting production data
 */
export async function seedAgentTemplates(): Promise<void> {
  try {
    logger.info('Starting agent template seeding...');

    // Create the agent template repository
    const templateRepo = new AgentTemplateRepository();

    logger.info('Seeding database with default agent templates...');

    let addedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const template of ALL_AGENT_TEMPLATES) {
      try {
        // Check if template already exists by slug - more reliable than name search
        const existingTemplate = await templateRepo.findBySlug(template.slug as string);

        if (existingTemplate) {
          // Skip existing templates to avoid overwriting production data
          logger.info(`Agent template already exists, skipping: ${template.name} (slug: ${template.slug})`);
          existingCount++;
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

    logger.info(`✅ Agent template seeding completed: ${addedCount} new, ${existingCount} skipped, ${errorCount} errors`);
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
