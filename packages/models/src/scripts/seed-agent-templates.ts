/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { getConnection } from '@/helpers/database';
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

    // Get the existing connection that was initialized by the server
    const connection = getConnection();

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
