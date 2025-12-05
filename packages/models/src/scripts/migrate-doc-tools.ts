/**
 * Doc Tools Migration Script
 *
 * Part 1: Remove docs-blueprint-examples and docs-node-schema from all starships
 * - Unassign from Daedalus agents
 * - Delete tools from starships
 *
 * Part 2: Deploy search-docs and get-doc to all starships
 * - Create tools from templates if missing
 * - Assign to Daedalus agents
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
  blueprintExamplesRemoved: number;
  nodeSchemaRemoved: number;
  toolsUnassignedFromAgents: number;
  removalErrors: number;

  // Part 2: Deployment
  searchDocsDeployed: number;
  getDocDeployed: number;
  searchDocsAssigned: number;
  getDocAssigned: number;
  deploymentErrors: number;
}

/**
 * Part 1: Remove docs-blueprint-examples and docs-node-schema
 */
async function removeOldDocTools(starshipId: string): Promise<{
  blueprintExamplesRemoved: number;
  nodeSchemaRemoved: number;
  toolsUnassignedFromAgents: number;
  errors: number;
}> {
  const stats = {
    blueprintExamplesRemoved: 0,
    nodeSchemaRemoved: 0,
    toolsUnassignedFromAgents: 0,
    errors: 0,
  };

  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();

  try {
    // Find template IDs for the tools to remove
    const templateRepo = new ToolTemplateRepository();
    const blueprintExamplesTemplate = await templateRepo.findBySlug('docs-blueprint-examples');
    const nodeSchemaTemplate = await templateRepo.findBySlug('docs-node-schema');

    if (!blueprintExamplesTemplate || !nodeSchemaTemplate) {
      logger.warn('Could not find templates for docs-blueprint-examples or docs-node-schema');
      return stats;
    }

    // Find all tools in this starship that match these templates
    const allTools = await toolRepo.findByStarship(starshipId);
    const toolsToRemove = allTools.filter(
      (tool) => tool.templateId === blueprintExamplesTemplate.id || tool.templateId === nodeSchemaTemplate.id
    );

    logger.info(`Found ${toolsToRemove.length} old doc tools to remove from starship ${starshipId}`);

    for (const tool of toolsToRemove) {
      try {
        // Find all agents in this starship
        const agents = await agentRepo.findByStarship(starshipId);

        // For each agent, check if this tool is assigned and unassign it
        for (const agent of agents) {
          try {
            const agentTools = await agentRepo.getAgentToolsByRelationships(agent.id);
            const isAssigned = agentTools.some((t: ToolModel) => t.id === tool.id);

            if (isAssigned) {
              await agentRepo.removeToolRelationship(agent.id, tool.id);
              stats.toolsUnassignedFromAgents++;
              logger.info(`Unassigned tool "${tool.name}" from agent "${agent.name}"`);
            }
          } catch (error) {
            stats.errors++;
            logger.warn(
              `Failed to unassign tool ${tool.id} from agent ${agent.id}`,
              { component: 'migrate-doc-tools', operation: 'unassignTool' },
              error as Error
            );
          }
        }

        // Delete the tool
        const deleted = await toolRepo.delete(tool.id);
        if (deleted) {
          if (tool.templateId === blueprintExamplesTemplate.id) {
            stats.blueprintExamplesRemoved++;
          } else if (tool.templateId === nodeSchemaTemplate.id) {
            stats.nodeSchemaRemoved++;
          }
          logger.info(`Deleted tool "${tool.name}" (${tool.slug})`);
        }
      } catch (error) {
        stats.errors++;
        logger.warn(
          `Failed to remove tool ${tool.id}`,
          { component: 'migrate-doc-tools', operation: 'removeTool' },
          error as Error
        );
      }
    }
  } catch (error) {
    stats.errors++;
    logger.error(
      `Failed to remove old doc tools for starship ${starshipId}`,
      { component: 'migrate-doc-tools', operation: 'removeOldDocTools' },
      error as Error
    );
  }

  return stats;
}

/**
 * Part 2: Deploy search-docs and get-doc and assign to Daedalus
 */
async function deployNewDocTools(starshipId: string): Promise<{
  searchDocsDeployed: number;
  getDocDeployed: number;
  searchDocsAssigned: number;
  getDocAssigned: number;
  errors: number;
}> {
  const stats = {
    searchDocsDeployed: 0,
    getDocDeployed: 0,
    searchDocsAssigned: 0,
    getDocAssigned: 0,
    errors: 0,
  };

  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();
  const templateRepo = new ToolTemplateRepository();

  try {
    // Find the templates
    const searchDocsTemplate = await templateRepo.findBySlug('search-docs');
    const getDocTemplate = await templateRepo.findBySlug('get-doc');

    if (!searchDocsTemplate || !getDocTemplate) {
      logger.warn('Could not find templates for search-docs or get-doc');
      stats.errors++;
      return stats;
    }

    // Find all tools in this starship
    const existingTools = await toolRepo.findByStarship(starshipId);

    // Check if search-docs exists
    const hasSearchDocs = existingTools.some((tool) => tool.templateId === searchDocsTemplate.id);
    let searchDocsTool = existingTools.find((tool) => tool.templateId === searchDocsTemplate.id);

    if (!hasSearchDocs) {
      try {
        logger.info(`Deploying search-docs to starship ${starshipId}`);
        searchDocsTool = await toolRepo.createFromTemplate('search-docs', starshipId);
        stats.searchDocsDeployed++;
        logger.info(`✅ Deployed search-docs (${searchDocsTool.id})`);
      } catch (error) {
        stats.errors++;
        logger.error(
          `Failed to deploy search-docs to starship ${starshipId}`,
          { component: 'migrate-doc-tools', operation: 'deploySearchDocs' },
          error as Error
        );
      }
    }

    // Check if get-doc exists
    const hasGetDoc = existingTools.some((tool) => tool.templateId === getDocTemplate.id);
    let getDocTool = existingTools.find((tool) => tool.templateId === getDocTemplate.id);

    if (!hasGetDoc) {
      try {
        logger.info(`Deploying get-doc to starship ${starshipId}`);
        getDocTool = await toolRepo.createFromTemplate('get-doc', starshipId);
        stats.getDocDeployed++;
        logger.info(`✅ Deployed get-doc (${getDocTool.id})`);
      } catch (error) {
        stats.errors++;
        logger.error(
          `Failed to deploy get-doc to starship ${starshipId}`,
          { component: 'migrate-doc-tools', operation: 'deployGetDoc' },
          error as Error
        );
      }
    }

    // Find Daedalus agent in this starship
    const agents = await agentRepo.findByStarship(starshipId);
    const daedalusTemplateId = await findDaedalusTemplateId();

    const daedalusAgent = agents.find((agent) => agent.sourceTemplateId === daedalusTemplateId);

    if (!daedalusAgent) {
      logger.info(`No Daedalus agent found in starship ${starshipId}`);
      return stats;
    }

    // Get tools currently assigned to Daedalus
    const assignedTools = await agentRepo.getAgentToolsByRelationships(daedalusAgent.id);

    // Assign search-docs if not already assigned
    if (searchDocsTool) {
      const isSearchDocsAssigned = assignedTools.some((tool: ToolModel) => tool.id === searchDocsTool!.id);
      if (!isSearchDocsAssigned) {
        try {
          await agentRepo.addToolRelationship(daedalusAgent.id, searchDocsTool.id);
          stats.searchDocsAssigned++;
          logger.info(`✅ Assigned search-docs to Daedalus agent "${daedalusAgent.name}"`);
        } catch (error) {
          stats.errors++;
          logger.error(
            `Failed to assign search-docs to Daedalus agent ${daedalusAgent.id}`,
            { component: 'migrate-doc-tools', operation: 'assignSearchDocs' },
            error as Error
          );
        }
      }
    }

    // Assign get-doc if not already assigned
    if (getDocTool) {
      const isGetDocAssigned = assignedTools.some((tool: ToolModel) => tool.id === getDocTool!.id);
      if (!isGetDocAssigned) {
        try {
          await agentRepo.addToolRelationship(daedalusAgent.id, getDocTool.id);
          stats.getDocAssigned++;
          logger.info(`✅ Assigned get-doc to Daedalus agent "${daedalusAgent.name}"`);
        } catch (error) {
          stats.errors++;
          logger.error(
            `Failed to assign get-doc to Daedalus agent ${daedalusAgent.id}`,
            { component: 'migrate-doc-tools', operation: 'assignGetDoc' },
            error as Error
          );
        }
      }
    }
  } catch (error) {
    stats.errors++;
    logger.error(
      `Failed to deploy new doc tools for starship ${starshipId}`,
      { component: 'migrate-doc-tools', operation: 'deployNewDocTools' },
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
 * Main migration function
 */
export async function migrateDocTools(targetStarshipIds?: string[]): Promise<void> {
  try {
    logger.info('🚀 Starting Doc Tools Migration...');

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

    if (starships.length === 0) {
      logger.info('No starships to process');
      return;
    }

    const totalStats: MigrationStats = {
      starshipsProcessed: 0,
      blueprintExamplesRemoved: 0,
      nodeSchemaRemoved: 0,
      toolsUnassignedFromAgents: 0,
      removalErrors: 0,
      searchDocsDeployed: 0,
      getDocDeployed: 0,
      searchDocsAssigned: 0,
      getDocAssigned: 0,
      deploymentErrors: 0,
    };

    // Process each starship
    for (const starship of starships) {
      logger.info(`\n📦 Processing starship: ${starship.name} (${starship.slug})`);

      // Part 1: Remove old doc tools
      logger.info('  [Part 1] Removing docs-blueprint-examples and docs-node-schema...');
      const removalStats = await removeOldDocTools(starship.id);
      totalStats.blueprintExamplesRemoved += removalStats.blueprintExamplesRemoved;
      totalStats.nodeSchemaRemoved += removalStats.nodeSchemaRemoved;
      totalStats.toolsUnassignedFromAgents += removalStats.toolsUnassignedFromAgents;
      totalStats.removalErrors += removalStats.errors;

      // Part 2: Deploy new doc tools
      logger.info('  [Part 2] Deploying search-docs and get-doc...');
      const deploymentStats = await deployNewDocTools(starship.id);
      totalStats.searchDocsDeployed += deploymentStats.searchDocsDeployed;
      totalStats.getDocDeployed += deploymentStats.getDocDeployed;
      totalStats.searchDocsAssigned += deploymentStats.searchDocsAssigned;
      totalStats.getDocAssigned += deploymentStats.getDocAssigned;
      totalStats.deploymentErrors += deploymentStats.errors;

      totalStats.starshipsProcessed++;
      logger.info(`  ✅ Starship ${starship.slug} completed`);
    }

    // Final Summary
    logger.info('\n═══════════════════════════════════════════════════════════');
    logger.info('Doc Tools Migration Summary:');
    logger.info(`  Starships Processed: ${totalStats.starshipsProcessed}`);
    logger.info('');
    logger.info('  [Part 1] Removal:');
    logger.info(`    - Docs Blueprint Examples removed: ${totalStats.blueprintExamplesRemoved}`);
    logger.info(`    - Docs Node Schema removed: ${totalStats.nodeSchemaRemoved}`);
    logger.info(`    - Tools unassigned from agents: ${totalStats.toolsUnassignedFromAgents}`);
    logger.info(`    - Errors: ${totalStats.removalErrors}`);
    logger.info('');
    logger.info('  [Part 2] Deployment:');
    logger.info(`    - Search Docs deployed: ${totalStats.searchDocsDeployed}`);
    logger.info(`    - Get Doc deployed: ${totalStats.getDocDeployed}`);
    logger.info(`    - Search Docs assigned to Daedalus: ${totalStats.searchDocsAssigned}`);
    logger.info(`    - Get Doc assigned to Daedalus: ${totalStats.getDocAssigned}`);
    logger.info(`    - Errors: ${totalStats.deploymentErrors}`);
    logger.info('═══════════════════════════════════════════════════════════');

    if (totalStats.removalErrors > 0 || totalStats.deploymentErrors > 0) {
      logger.warn(`⚠️  Migration completed with ${totalStats.removalErrors + totalStats.deploymentErrors} errors`);
    } else {
      logger.info('✅ Migration completed successfully');
    }
  } catch (error) {
    logger.error('Failed to run doc tools migration', { component: 'migrate-doc-tools' }, error as Error);
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
    console.log('Migrating all starships');
  }

  migrateDocTools(starshipIds)
    .then(() => {
      console.log('✅ Doc tools migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Doc tools migration failed:', error);
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
