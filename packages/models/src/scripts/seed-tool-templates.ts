/**
 * Seed Tool Templates
 * Creates default tool templates available for agents and marketplace
 */

import { logger } from '@/helpers/logging';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import { generateSlug } from '@/helpers/slugUtils';
import type { CreateToolTemplateRequest } from '@starships/protocol';
import { ALL_TOOL_TEMPLATES } from '@/seeders/tools';

/**
 * Seeds the database with default tool templates
 * Safe to run multiple times - updates existing templates to keep them current
 */
export async function seedToolTemplates(): Promise<void> {
  try {
    logger.info('Starting tool template seeding...');

    // Create repository
    const toolTemplateRepo = new ToolTemplateRepository();

    logger.info('Seeding database with default tool templates...');

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const template of ALL_TOOL_TEMPLATES) {
      // Prefer explicit slug if present; otherwise generate from name
      const slug = template.slug || generateSlug(template.name);

      try {

        const existing = await toolTemplateRepo.findBySlug(slug);

        if (existing) {
          // Update existing template with latest data from seeder
          const updated = await toolTemplateRepo.update(existing.id, {
            name: template.name,
            description: template.description,
            parameters: template.parameters,
            category: template.category,
            exampleUsage: template.exampleUsage,
            requiresApiKey: template.requiresApiKey,
            configurationFields: template.configurationFields,
            blueprint: template.blueprint,
            transforms: template.transforms,
            mutations: template.mutations,
            condition: template.condition,
            version: template.version, // Copy version from seeder
          });

          if (updated) {
            logger.info(`✅ Template UPDATED: ${template.name} v${updated.version} (slug: ${slug})`);
            updatedCount++;
          }
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
            transforms: template.transforms,
            mutations: template.mutations,
            condition: template.condition,
            version: template.version, // Include version in creation
          };
          const created = await toolTemplateRepo.create(payload);
          addedCount++;
          logger.info(`✅ Template CREATED: ${template.name} v${created.version} (slug: ${slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(
          `Tool template error processing ${template.name}`,
          { component: 'seed-tool-templates', operation: 'upsert', metadata: { templateName: template.name, slug: slug } },
          error as Error
        );
      }
    }

    logger.info(`✅ Tool template seeding completed: ${addedCount} created, ${updatedCount} updated, ${errorCount} errors`);
  } catch (error) {
    logger.error('Failed to seed tool templates', { component: 'seed-tool-templates' }, error as Error);
    // Do not throw; seeding failure should not block startup
  }
}
