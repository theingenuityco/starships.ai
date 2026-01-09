/**
 * Seed Tool Templates
 * Creates default tool templates available for agents and marketplace
 */

import { logger } from '@/helpers/logging';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import type { CreateToolTemplateRequest, ToolTemplateModel } from '@starships/protocol';
import { ALL_TOOL_TEMPLATES } from '@/seeders/tools';
import type { UpdateToolTemplateRequest } from '@starships/protocol';

type SeededToolTemplate = Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>;

export interface SeedToolTemplatesOptions {
  /**
   * Limit the seed run to only these templates.
   *
   * Notes:
   * - Matching is done against the seeded template's `name` or `slug`.
   * - DB upserts are still keyed by name (see repo behavior), this is only a
   *   convenience filter for *which* templates to apply from seeders.
   */
  only?: {
    names?: string[];
    slugs?: string[];
  };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Seeds the database with default tool templates
 * Safe to run multiple times - updates existing templates to keep them current
 */
export async function seedToolTemplates(options?: SeedToolTemplatesOptions): Promise<void> {
  try {
    logger.info('Starting tool template seeding...');

    // Create repository
    const toolTemplateRepo = new ToolTemplateRepository();

    logger.info('Seeding database with default tool templates...');

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    const allToolTemplates = ALL_TOOL_TEMPLATES as readonly SeededToolTemplate[];
    const onlyNames = (options?.only?.names ?? []).map(normalize);
    const onlySlugs = (options?.only?.slugs ?? []).map(normalize);
    const isFiltered = onlyNames.length > 0 || onlySlugs.length > 0;

    const selectedTemplates = isFiltered
      ? allToolTemplates.filter((t) => {
          const slug = normalize(t.slug);
          const name = normalize(t.name);
          return (onlyNames.length > 0 && onlyNames.includes(name)) || (onlySlugs.length > 0 && onlySlugs.includes(slug));
        })
      : allToolTemplates;

    if (isFiltered) {
      logger.info(`Tool template seeding filter enabled: ${selectedTemplates.length}/${allToolTemplates.length} selected`, {
        component: 'seed-tool-templates',
        metadata: { onlyNames: options?.only?.names ?? [], onlySlugs: options?.only?.slugs ?? [] },
      });
    }

    for (const template of selectedTemplates) {
      try {
        // Template slugs are server-generated (random suffix) and not stable enough for upserts.
        // Seed upserts are keyed by name.
        const existing = await toolTemplateRepo.findByName(template.name);

        if (existing) {
          // Update existing template with latest data from seeder
          const updatePayload: UpdateToolTemplateRequest = {
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
          };
          // Only pass name if it actually changed; otherwise we'd regenerate slug on every seed run.
          if (existing.name !== template.name) {
            updatePayload.name = template.name;
          }

          const updated = await toolTemplateRepo.update(existing.id, updatePayload);

          if (updated) {
            logger.info(`✅ Template UPDATED: ${template.name} v${updated.version} (slug: ${updated.slug})`);
            updatedCount++;
          }
        } else {
          // Create new template
          const payload: CreateToolTemplateRequest = {
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
            version: template.version, // Include version in creation
          };
          const created = await toolTemplateRepo.create(payload);
          addedCount++;
          logger.info(`✅ Template CREATED: ${template.name} v${created.version} (slug: ${created.slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(
          `Tool template error processing ${template.name}`,
          { component: 'seed-tool-templates', operation: 'upsert', metadata: { templateName: template.name } },
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
