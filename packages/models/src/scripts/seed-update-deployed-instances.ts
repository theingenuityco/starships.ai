/**
 * Update Deployed Agent and Tool Instances
 *
 * This script updates deployed agents and tools in starships when their templates have newer versions.
 * It should be run after template seeding to ensure instances stay in sync with their templates.
 *
 * Features:
 * - Only updates instances that have a templateId (template-based instances)
 * - Compares current instance version with template version using semver
 * - Only updates when template has a newer version
 * - Can target specific starships or all starships
 * - Safe to run multiple times (idempotent)
 */

import { logger } from '@/helpers/logging';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ToolRepository } from '@/repositories/ToolRepository';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import { compareVersions } from '@/utils/version';

interface UpdateStats {
  starshipsProcessed: number;
  agentsChecked: number;
  agentsUpdated: number;
  agentErrors: number;
  toolsChecked: number;
  toolsUpdated: number;
  toolErrors: number;
}

/**
 * Update agents and tools in a specific starship
 */
async function updateStarshipInstances(starshipId: string, starshipSlug: string): Promise<Omit<UpdateStats, 'starshipsProcessed'>> {
  const stats = {
    agentsChecked: 0,
    agentsUpdated: 0,
    agentErrors: 0,
    toolsChecked: 0,
    toolsUpdated: 0,
    toolErrors: 0,
  };

  const agentRepo = new AgentRepository();
  const toolRepo = new ToolRepository();
  const agentTemplateRepo = new AgentTemplateRepository();
  const toolTemplateRepo = new ToolTemplateRepository();

  // Process agents
  try {
    const agents = await agentRepo.findByStarship(starshipId);
    const templateAgents = agents.filter((agent) => agent.sourceTemplateId);

    stats.agentsChecked = templateAgents.length;

    for (const agent of templateAgents) {
      try {
        if (!agent.sourceTemplateId) continue;

        // Fetch the template to compare versions
        const template = await agentTemplateRepo.findById(agent.sourceTemplateId);

        if (!template) {
          logger.warn(`Agent template not found for agent ${agent.id} (sourceTemplateId: ${agent.sourceTemplateId})`);
          continue;
        }

        // Compare versions - only update if template is newer
        const comparison = compareVersions(agent.version, template.version);

        if (comparison < 0) {
          // Agent version is older than template version - update needed
          logger.info(
            `Updating agent "${agent.name}" (${agent.slug}) from v${agent.version} to v${template.version} in starship ${starshipSlug}`
          );

          await agentRepo.updateFromTemplate(agent.id);
          stats.agentsUpdated++;

          logger.info(`✅ Agent "${agent.name}" updated successfully to v${template.version}`);
        } else if (comparison === 0) {
          logger.debug(`Agent "${agent.name}" (${agent.slug}) is already up-to-date (v${agent.version})`);
        } else {
          logger.warn(`Agent "${agent.name}" (${agent.slug}) version (v${agent.version}) is newer than template (v${template.version})`);
        }
      } catch (error) {
        stats.agentErrors++;
        logger.warn(
          `Failed to update agent ${agent.name} (${agent.id})`,
          {
            component: 'seed-update-deployed-instances',
            operation: 'updateAgent',
            metadata: { agentId: agent.id, starshipId, starshipSlug },
          },
          error as Error
        );
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process agents for starship ${starshipSlug}`,
      { component: 'seed-update-deployed-instances', operation: 'processAgents' },
      error as Error
    );
  }

  // Process tools
  try {
    const tools = await toolRepo.findByStarship(starshipId);
    const templateTools = tools.filter((tool) => tool.sourceTemplateId);

    stats.toolsChecked = templateTools.length;

    for (const tool of templateTools) {
      try {
        if (!tool.sourceTemplateId) continue;

        // Fetch the template to compare versions
        const template = await toolTemplateRepo.findById(tool.sourceTemplateId);

        if (!template) {
          logger.warn(`Tool template not found for tool ${tool.id} (sourceTemplateId: ${tool.sourceTemplateId})`);
          continue;
        }

        // Compare versions - only update if template is newer
        const comparison = compareVersions(tool.version, template.version);

        if (comparison < 0) {
          // Tool version is older than template version - update needed
          logger.info(
            `Updating tool "${tool.name}" (${tool.slug}) from v${tool.version} to v${template.version} in starship ${starshipSlug}`
          );

          await toolRepo.updateFromTemplate(tool.id);
          stats.toolsUpdated++;

          logger.info(`✅ Tool "${tool.name}" updated successfully to v${template.version}`);
        } else if (comparison === 0) {
          logger.debug(`Tool "${tool.name}" (${tool.slug}) is already up-to-date (v${tool.version})`);
        } else {
          logger.warn(`Tool "${tool.name}" (${tool.slug}) version (v${tool.version}) is newer than template (v${template.version})`);
        }
      } catch (error) {
        stats.toolErrors++;
        logger.warn(
          `Failed to update tool ${tool.name} (${tool.id})`,
          {
            component: 'seed-update-deployed-instances',
            operation: 'updateTool',
            metadata: { toolId: tool.id, starshipId, starshipSlug },
          },
          error as Error
        );
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process tools for starship ${starshipSlug}`,
      { component: 'seed-update-deployed-instances', operation: 'processTools' },
      error as Error
    );
  }

  return stats;
}

/**
 * Update agents and tools across all starships or specific ones
 *
 * @param starshipIds Optional array of starship IDs to target. If not provided, updates all starships.
 */
export async function seedUpdateDeployedInstances(starshipIds?: string[]): Promise<void> {
  try {
    logger.info('Starting deployed instance update seeding...');

    const starshipRepo = new StarshipRepository();
    let starships;

    if (starshipIds && starshipIds.length > 0) {
      // Target specific starships
      logger.info(`Targeting ${starshipIds.length} specific starship(s): ${starshipIds.join(', ')}`);
      starships = [];
      for (const id of starshipIds) {
        const starship = await starshipRepo.findById(id);
        if (starship) {
          starships.push(starship);
        } else {
          logger.warn(`Starship with ID ${id} not found`);
        }
      }
    } else {
      // Get all starships
      logger.info('Fetching all starships...');
      starships = await starshipRepo.findAll();
      logger.info(`Found ${starships.length} starship(s) to process`);
    }

    if (starships.length === 0) {
      logger.info('No starships to process');
      return;
    }

    const totalStats: UpdateStats = {
      starshipsProcessed: 0,
      agentsChecked: 0,
      agentsUpdated: 0,
      agentErrors: 0,
      toolsChecked: 0,
      toolsUpdated: 0,
      toolErrors: 0,
    };

    // Process each starship
    for (const starship of starships) {
      logger.info(`Processing starship: ${starship.name} (${starship.slug})`);

      const stats = await updateStarshipInstances(starship.id, starship.slug);

      totalStats.starshipsProcessed++;
      totalStats.agentsChecked += stats.agentsChecked;
      totalStats.agentsUpdated += stats.agentsUpdated;
      totalStats.agentErrors += stats.agentErrors;
      totalStats.toolsChecked += stats.toolsChecked;
      totalStats.toolsUpdated += stats.toolsUpdated;
      totalStats.toolErrors += stats.toolErrors;

      logger.info(
        `Starship ${starship.slug} completed: ${stats.agentsUpdated}/${stats.agentsChecked} agents updated, ${stats.toolsUpdated}/${stats.toolsChecked} tools updated`
      );
    }

    // Summary
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('Deployed Instance Update Summary:');
    logger.info(`  Starships Processed: ${totalStats.starshipsProcessed}`);
    logger.info(`  Agents:`);
    logger.info(`    - Checked: ${totalStats.agentsChecked}`);
    logger.info(`    - Updated: ${totalStats.agentsUpdated}`);
    logger.info(`    - Errors: ${totalStats.agentErrors}`);
    logger.info(`  Tools:`);
    logger.info(`    - Checked: ${totalStats.toolsChecked}`);
    logger.info(`    - Updated: ${totalStats.toolsUpdated}`);
    logger.info(`    - Errors: ${totalStats.toolErrors}`);
    logger.info('═══════════════════════════════════════════════════════════');

    if (totalStats.agentsUpdated > 0 || totalStats.toolsUpdated > 0) {
      logger.info(`✅ Successfully updated ${totalStats.agentsUpdated} agent(s) and ${totalStats.toolsUpdated} tool(s)`);
    } else {
      logger.info('✅ All instances are already up-to-date');
    }
  } catch (error) {
    logger.error('Failed to update deployed instances', { component: 'seed-update-deployed-instances' }, error as Error);
    // Don't throw - we don't want to prevent other operations from running
  }
}

/**
 * CLI entry point - allows running the script standalone
 */
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const starshipIds = args.length > 0 ? args : undefined;

  if (starshipIds) {
    console.log(`Targeting specific starships: ${starshipIds.join(', ')}`);
  } else {
    console.log('Updating all starships');
  }

  seedUpdateDeployedInstances(starshipIds)
    .then(() => {
      console.log('✅ Deployed instance update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Deployed instance update failed:', error);
      process.exit(1);
    });
}
