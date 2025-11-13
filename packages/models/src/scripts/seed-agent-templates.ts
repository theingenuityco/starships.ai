/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ALL_AGENT_TEMPLATES } from '@/seeders/agents';

/**
 * Seeds the database with default agent templates
 * Safe to run multiple times - updates existing templates to keep them current
 */
export async function seedAgentTemplates(): Promise<void> {
  try {
    logger.info('Starting agent template seeding...');

    // Create the agent template repository
    const templateRepo = new AgentTemplateRepository();

    logger.info('Seeding database with default agent templates...');

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const template of ALL_AGENT_TEMPLATES) {
      try {
        // Check if template already exists by slug - more reliable than name search
        const existingTemplate = await templateRepo.findBySlug(template.slug as string);

        if (existingTemplate) {
          // Update existing template with latest data from seeder
          const updated = await templateRepo.update(existingTemplate.id, {
            name: template.name,
            description: template.description,
            category: template.category,
            model: template.model,
            temperature: template.temperature,
            maxTokens: template.maxTokens,
            timeout: template.timeout,
            systemPrompt: template.systemPrompt,
            blueprint: template.blueprint,
            state: template.state,
            icon: template.icon,
            previewPrompts: template.previewPrompts,
            assignedToolSlugs: template.assignedToolSlugs,
            version: template.version, // Copy version from seeder
          });

          if (updated) {
            logger.info(`✅ Template UPDATED: ${template.name} v${updated.version} (slug: ${template.slug})`);
            updatedCount++;
          }
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
            version: template.version, // Include version in creation
          };
          await templateRepo.create(payload);
          addedCount++;
          logger.info(`✅ Template CREATED: ${template.name} v${template.version} (slug: ${template.slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(
          `Agent template error processing ${template.name} (slug: ${template.slug})`,
          {
            component: 'seed-agent-templates',
            operation: 'upsert',
            metadata: { templateName: template.name, slug: template.slug },
          },
          error as Error
        );
      }
    }

    logger.info(`✅ Agent template seeding completed: ${addedCount} created, ${updatedCount} updated, ${errorCount} errors`);
  } catch (error) {
    logger.error('Failed to seed agent templates', { component: 'seed-agent-templates' }, error as Error);
    // Don't throw - we don't want to prevent server startup if template seeding fails
  }
}
