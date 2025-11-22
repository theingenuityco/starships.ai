/**
 * Blueprint Tools Migration Script
 *
 * Part 1: Remove legacy blueprint CRUD tools from all starships
 * - Unassign from Daedalus agents (and any other agents)
 * - Delete tools from starships
 *
 * Legacy tool template slugs:
 * - add-tool-blueprint-node
 * - edit-tool-blueprint-node
 * - remove-tool-blueprint-node
 * - add-tool-blueprint-edge
 * - edit-tool-blueprint-edge
 * - remove-tool-blueprint-edge
 *
 * Part 2: Deploy unified blueprint tools to all starships
 * - modify-tool-blueprint-node
 * - modify-tool-blueprint-edge
 * - list-connectors
 * - Create tools from templates if missing
 * - Assign tools to Daedalus agent in each starship (when present)
 */

import { logger } from '@/helpers/logging';
import { createConnection } from '@/helpers/database';
import { getEnvConfig } from '@starships/env';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ToolRepository } from '@/repositories/ToolRepository';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import type { ToolModel } from '@starships/protocol';

interface MigrationStats {
  starshipsProcessed: number;

  // Part 1: Removal
  legacyToolsRemoved: number;
  toolsUnassignedFromAgents: number;
  removalErrors: number;

  // Part 2: Deployment
  modifyNodeDeployed: number;
  modifyEdgeDeployed: number;
  modifyNodeAssigned: number;
  modifyEdgeAssigned: number;
  connectorsListDeployed: number;
  connectorsListAssigned: number;
  deploymentErrors: number;
}

const LEGACY_BLUEPRINT_TOOL_TEMPLATE_SLUGS = [
  'add-tool-blueprint-node',
  'edit-tool-blueprint-node',
  'remove-tool-blueprint-node',
  'add-tool-blueprint-edge',
  'edit-tool-blueprint-edge',
  'remove-tool-blueprint-edge',
] as const;

/**
 * Part 1: Remove legacy blueprint tools from a single starship
 */
async function removeLegacyBlueprintTools(starshipId: string): Promise<{
  legacyToolsRemoved: number;
  toolsUnassignedFromAgents: number;
  errors: number;
}> {
  const stats = {
    legacyToolsRemoved: 0,
    toolsUnassignedFromAgents: 0,
    errors: 0,
  };

  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();
  const templateRepo = new ToolTemplateRepository();

  try {
    // Resolve template IDs for all legacy blueprint tools
    const legacyTemplates = await Promise.all(
      LEGACY_BLUEPRINT_TOOL_TEMPLATE_SLUGS.map(async (slug) => ({
        slug,
        template: await templateRepo.findBySlug(slug),
      }))
    );

    const missingTemplates = legacyTemplates.filter((t) => !t.template).map((t) => t.slug);
    if (missingTemplates.length > 0) {
      logger.warn(`Some legacy blueprint tool templates not found: ${missingTemplates.join(', ')} (skipping removal for those templates)`);
    }

    const legacyTemplateIds = legacyTemplates.filter((t) => t.template).map((t) => t.template!.id);

    if (legacyTemplateIds.length === 0) {
      logger.info('No legacy blueprint tool templates found; skipping removal for this starship');
      return stats;
    }

    // Find all tools in this starship that were created from any legacy template
    const allTools = await toolRepo.findByStarship(starshipId);
    const toolsToRemove = allTools.filter((tool) => tool.templateId && legacyTemplateIds.includes(tool.templateId));

    if (toolsToRemove.length === 0) {
      logger.info(`No legacy blueprint tools to remove from starship ${starshipId}`);
      return stats;
    }

    logger.info(`Found ${toolsToRemove.length} legacy blueprint tools to remove from starship ${starshipId}`);

    // For each tool, unassign from all agents in this starship then delete
    const agents = await agentRepo.findByStarship(starshipId);

    for (const tool of toolsToRemove) {
      try {
        // Unassign from any agents that currently reference this tool
        for (const agent of agents) {
          try {
            const agentTools = await agentRepo.getAgentToolsByRelationships(agent.id);
            const isAssigned = agentTools.some((t: ToolModel) => t.id === tool.id);

            if (isAssigned) {
              await agentRepo.removeToolRelationship(agent.id, tool.id);
              stats.toolsUnassignedFromAgents++;
              logger.info(`Unassigned legacy blueprint tool "${tool.name}" from agent "${agent.name}"`);
            }
          } catch (error) {
            stats.errors++;
            logger.warn(
              `Failed to unassign legacy blueprint tool ${tool.id} from agent ${agent.id}`,
              { component: 'migrate-blueprint-tools', operation: 'unassignLegacyTool' },
              error as Error
            );
          }
        }

        // Delete the tool instance
        const deleted = await toolRepo.delete(tool.id);
        if (deleted) {
          stats.legacyToolsRemoved++;
          logger.info(`Deleted legacy blueprint tool "${tool.name}" (${tool.slug})`);
        }
      } catch (error) {
        stats.errors++;
        logger.warn(
          `Failed to remove legacy blueprint tool ${tool.id}`,
          { component: 'migrate-blueprint-tools', operation: 'removeLegacyTool' },
          error as Error
        );
      }
    }
  } catch (error) {
    stats.errors++;
    logger.error(
      `Failed to remove legacy blueprint tools for starship ${starshipId}`,
      { component: 'migrate-blueprint-tools', operation: 'removeLegacyBlueprintTools' },
      error as Error
    );
  }

  return stats;
}

/**
 * Helper: Find Daedalus template ID
 */
async function findDaedalusTemplateId(): Promise<string | null> {
  const agentTemplateRepo = new (await import('@/repositories/AgentTemplateRepository')).AgentTemplateRepository();
  const template = await agentTemplateRepo.findBySlug('daedalus');
  return template?.id || null;
}

/**
 * Part 2: Deploy unified blueprint tools and assign to Daedalus
 */
async function deployUnifiedBlueprintTools(starshipId: string): Promise<{
  modifyNodeDeployed: number;
  modifyEdgeDeployed: number;
  modifyNodeAssigned: number;
  modifyEdgeAssigned: number;
  connectorsListDeployed: number;
  connectorsListAssigned: number;
  errors: number;
}> {
  const stats = {
    modifyNodeDeployed: 0,
    modifyEdgeDeployed: 0,
    modifyNodeAssigned: 0,
    modifyEdgeAssigned: 0,
    connectorsListDeployed: 0,
    connectorsListAssigned: 0,
    errors: 0,
  };

  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();
  const templateRepo = new ToolTemplateRepository();

  try {
    // Resolve unified templates
    const modifyNodeTemplate = await templateRepo.findBySlug('modify-tool-blueprint-node');
    const modifyEdgeTemplate = await templateRepo.findBySlug('modify-tool-blueprint-edge');
    const connectorsListTemplate = await templateRepo.findBySlug('list-connectors');

    if (!modifyNodeTemplate || !modifyEdgeTemplate || !connectorsListTemplate) {
      const missing: string[] = [];
      if (!modifyNodeTemplate) missing.push('modify-tool-blueprint-node');
      if (!modifyEdgeTemplate) missing.push('modify-tool-blueprint-edge');
      if (!connectorsListTemplate) missing.push('list-connectors');
      logger.warn(`Could not find unified blueprint tool templates: ${missing.join(', ')}`);
      stats.errors++;
      return stats;
    }

    // Find existing tools in this starship
    const existingTools = await toolRepo.findByStarship(starshipId);

    // Ensure modify-node tool exists
    const hasModifyNode = existingTools.some((tool) => tool.templateId === modifyNodeTemplate.id);
    let modifyNodeTool = existingTools.find((tool) => tool.templateId === modifyNodeTemplate.id);

    if (!hasModifyNode) {
      try {
        logger.info(`Deploying modify-tool-blueprint-node to starship ${starshipId}`);
        modifyNodeTool = await toolRepo.createFromTemplate('modify-tool-blueprint-node', starshipId);
        stats.modifyNodeDeployed++;
        logger.info(`✅ Deployed modify-tool-blueprint-node (${modifyNodeTool.id})`);
      } catch (error) {
        stats.errors++;
        logger.error(
          `Failed to deploy modify-tool-blueprint-node to starship ${starshipId}`,
          { component: 'migrate-blueprint-tools', operation: 'deployModifyNode' },
          error as Error
        );
      }
    }

    // Ensure modify-edge tool exists
    const hasModifyEdge = existingTools.some((tool) => tool.templateId === modifyEdgeTemplate.id);
    let modifyEdgeTool = existingTools.find((tool) => tool.templateId === modifyEdgeTemplate.id);

    if (!hasModifyEdge) {
      try {
        logger.info(`Deploying modify-tool-blueprint-edge to starship ${starshipId}`);
        modifyEdgeTool = await toolRepo.createFromTemplate('modify-tool-blueprint-edge', starshipId);
        stats.modifyEdgeDeployed++;
        logger.info(`✅ Deployed modify-tool-blueprint-edge (${modifyEdgeTool.id})`);
      } catch (error) {
        stats.errors++;
        logger.error(
          `Failed to deploy modify-tool-blueprint-edge to starship ${starshipId}`,
          { component: 'migrate-blueprint-tools', operation: 'deployModifyEdge' },
          error as Error
        );
      }
    }

    // Ensure list-connectors tool exists
    const hasConnectorsList = existingTools.some((tool) => tool.templateId === connectorsListTemplate.id);
    let connectorsListTool = existingTools.find((tool) => tool.templateId === connectorsListTemplate.id);

    if (!hasConnectorsList) {
      try {
        logger.info(`Deploying list-connectors to starship ${starshipId}`);
        connectorsListTool = await toolRepo.createFromTemplate('list-connectors', starshipId);
        stats.connectorsListDeployed++;
        logger.info(`✅ Deployed list-connectors (${connectorsListTool.id})`);
      } catch (error) {
        stats.errors++;
        logger.error(
          `Failed to deploy list-connectors to starship ${starshipId}`,
          { component: 'migrate-blueprint-tools', operation: 'deployListConnectors' },
          error as Error
        );
      }
    }

    // Find Daedalus agent in this starship
    const agents = await agentRepo.findByStarship(starshipId);
    const daedalusTemplateId = await findDaedalusTemplateId();

    const daedalusAgent = agents.find((agent) => agent.templateId === daedalusTemplateId);

    if (!daedalusAgent) {
      logger.info(`No Daedalus agent found in starship ${starshipId}`);
      return stats;
    }

    // Get tools currently assigned to Daedalus
    const assignedTools = await agentRepo.getAgentToolsByRelationships(daedalusAgent.id);

    // Assign modify-node if not already assigned
    if (modifyNodeTool) {
      const isAssigned = assignedTools.some((tool: ToolModel) => tool.id === modifyNodeTool!.id);
      if (!isAssigned) {
        try {
          await agentRepo.addToolRelationship(daedalusAgent.id, modifyNodeTool.id);
          stats.modifyNodeAssigned++;
          logger.info(`✅ Assigned modify-tool-blueprint-node to Daedalus agent "${daedalusAgent.name}"`);
        } catch (error) {
          stats.errors++;
          logger.error(
            `Failed to assign modify-tool-blueprint-node to Daedalus agent ${daedalusAgent.id}`,
            { component: 'migrate-blueprint-tools', operation: 'assignModifyNode' },
            error as Error
          );
        }
      }
    }

    // Assign modify-edge if not already assigned
    if (modifyEdgeTool) {
      const isAssigned = assignedTools.some((tool: ToolModel) => tool.id === modifyEdgeTool!.id);
      if (!isAssigned) {
        try {
          await agentRepo.addToolRelationship(daedalusAgent.id, modifyEdgeTool.id);
          stats.modifyEdgeAssigned++;
          logger.info(`✅ Assigned modify-tool-blueprint-edge to Daedalus agent "${daedalusAgent.name}"`);
        } catch (error) {
          stats.errors++;
          logger.error(
            `Failed to assign modify-tool-blueprint-edge to Daedalus agent ${daedalusAgent.id}`,
            { component: 'migrate-blueprint-tools', operation: 'assignModifyEdge' },
            error as Error
          );
        }
      }
    }

    // Assign list-connectors if not already assigned
    if (connectorsListTool) {
      const isAssigned = assignedTools.some((tool: ToolModel) => tool.id === connectorsListTool!.id);
      if (!isAssigned) {
        try {
          await agentRepo.addToolRelationship(daedalusAgent.id, connectorsListTool.id);
          stats.connectorsListAssigned++;
          logger.info(`✅ Assigned list-connectors to Daedalus agent "${daedalusAgent.name}"`);
        } catch (error) {
          stats.errors++;
          logger.error(
            `Failed to assign list-connectors to Daedalus agent ${daedalusAgent.id}`,
            { component: 'migrate-blueprint-tools', operation: 'assignListConnectors' },
            error as Error
          );
        }
      }
    }
  } catch (error) {
    stats.errors++;
    logger.error(
      `Failed to deploy unified blueprint tools for starship ${starshipId}`,
      { component: 'migrate-blueprint-tools', operation: 'deployUnifiedBlueprintTools' },
      error as Error
    );
  }

  return stats;
}

/**
 * Main migration function
 */
export async function migrateBlueprintTools(targetStarshipIds?: string[]): Promise<void> {
  try {
    logger.info('🚀 Starting Blueprint Tools Migration...');

    // Initialize and connect to database (following server pattern)
    const config = getEnvConfig();
    const dbConnection = createConnection({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DATABASE,
      ssl: config.POSTGRES_SSL,
    });
    await dbConnection.connect();
    logger.info('✅ Database connection established');

    const starshipRepo = new StarshipRepository();
    let starships;

    if (targetStarshipIds && targetStarshipIds.length > 0) {
      logger.info(`Targeting ${targetStarshipIds.length} specific starship(s)`);
      starships = [];
      for (const id of targetStarshipIds) {
        const starship = await starshipRepo.findById(id);
        if (starship) {
          starships.push(starship);
        } else {
          logger.warn(`Starship with ID ${id} not found`);
        }
      }
    } else {
      logger.info('Fetching all starships...');
      starships = await starshipRepo.findAll();
      logger.info(`Found ${starships.length} starship(s) to process`);
    }

    if (!starships || starships.length === 0) {
      logger.info('No starships to process');
      return;
    }

    const totalStats: MigrationStats = {
      starshipsProcessed: 0,
      legacyToolsRemoved: 0,
      toolsUnassignedFromAgents: 0,
      removalErrors: 0,
      modifyNodeDeployed: 0,
      modifyEdgeDeployed: 0,
      modifyNodeAssigned: 0,
      modifyEdgeAssigned: 0,
      connectorsListDeployed: 0,
      connectorsListAssigned: 0,
      deploymentErrors: 0,
    };

    // Process each starship
    for (const starship of starships) {
      logger.info(`\n📦 Processing starship: ${starship.name} (${starship.slug})`);

      // Part 1: Remove legacy blueprint tools
      logger.info('  [Part 1] Removing legacy blueprint tools...');
      const removalStats = await removeLegacyBlueprintTools(starship.id);
      totalStats.legacyToolsRemoved += removalStats.legacyToolsRemoved;
      totalStats.toolsUnassignedFromAgents += removalStats.toolsUnassignedFromAgents;
      totalStats.removalErrors += removalStats.errors;

      // Part 2: Deploy unified blueprint tools
      logger.info('  [Part 2] Deploying unified blueprint tools...');
      const deploymentStats = await deployUnifiedBlueprintTools(starship.id);
      totalStats.modifyNodeDeployed += deploymentStats.modifyNodeDeployed;
      totalStats.modifyEdgeDeployed += deploymentStats.modifyEdgeDeployed;
      totalStats.modifyNodeAssigned += deploymentStats.modifyNodeAssigned;
      totalStats.modifyEdgeAssigned += deploymentStats.modifyEdgeAssigned;
      totalStats.connectorsListDeployed += deploymentStats.connectorsListDeployed;
      totalStats.connectorsListAssigned += deploymentStats.connectorsListAssigned;
      totalStats.deploymentErrors += deploymentStats.errors;

      totalStats.starshipsProcessed++;
      logger.info(`  ✅ Starship ${starship.slug} completed`);
    }

    // Final Summary
    logger.info('\n═══════════════════════════════════════════════════════════');
    logger.info('Blueprint Tools Migration Summary:');
    logger.info(`  Starships Processed: ${totalStats.starshipsProcessed}`);
    logger.info('');
    logger.info('  [Part 1] Removal:');
    logger.info(`    - Legacy blueprint tools removed: ${totalStats.legacyToolsRemoved}`);
    logger.info(`    - Tools unassigned from agents: ${totalStats.toolsUnassignedFromAgents}`);
    logger.info(`    - Errors: ${totalStats.removalErrors}`);
    logger.info('');
    logger.info('  [Part 2] Deployment:');
    logger.info(`    - modify-tool-blueprint-node deployed: ${totalStats.modifyNodeDeployed}`);
    logger.info(`    - modify-tool-blueprint-edge deployed: ${totalStats.modifyEdgeDeployed}`);
    logger.info(`    - modify-tool-blueprint-node assigned to Daedalus: ${totalStats.modifyNodeAssigned}`);
    logger.info(`    - modify-tool-blueprint-edge assigned to Daedalus: ${totalStats.modifyEdgeAssigned}`);
      logger.info(`    - list-connectors deployed: ${totalStats.connectorsListDeployed}`);
      logger.info(`    - list-connectors assigned to Daedalus: ${totalStats.connectorsListAssigned}`);
    logger.info(`    - Errors: ${totalStats.deploymentErrors}`);
    logger.info('═══════════════════════════════════════════════════════════');

    if (totalStats.removalErrors > 0 || totalStats.deploymentErrors > 0) {
      logger.warn(`⚠️  Migration completed with ${totalStats.removalErrors + totalStats.deploymentErrors} errors`);
    } else {
      logger.info('✅ Blueprint tools migration completed successfully');
    }
  } catch (error) {
    logger.error('Failed to run blueprint tools migration', { component: 'migrate-blueprint-tools' }, error as Error);
    throw error;
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const starshipIds = args.length > 0 ? args : undefined;

  if (starshipIds) {
    console.log(`Targeting specific starships: ${starshipIds.join(', ')}`);
  } else {
    console.log('Migrating blueprint tools for all starships');
  }

  migrateBlueprintTools(starshipIds)
    .then(() => {
      console.log('✅ Blueprint tools migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Blueprint tools migration failed:', error);
      process.exit(1);
    });
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n⚠️  Migration interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Migration terminated');
  process.exit(143);
});
