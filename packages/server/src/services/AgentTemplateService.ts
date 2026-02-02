import { NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  AgentTemplateRepository,
  ConnectorTemplateRepository,
  ToolRepository,
  ToolTemplateRepository,
  StarshipRepository,
} from '@starships/models';
import type {
  AgentModel,
  AgentTemplateModel,
  StarshipModel,
  CreateAgentTemplateRequest,
  UpdateAgentTemplateRequest,
} from '@starships/protocol';
import { getRequiredConnectorProviderIdsForTemplate } from '@/utils/required-connectors';

/** Required connector info for deploy modal */
export interface RequiredConnectorItem {
  provider: string;
  name: string;
  description?: string;
  auth: { type: string };
}

export class AgentTemplateService {
  private templateRepository: AgentTemplateRepository;
  private starshipRepository: StarshipRepository;
  private agentRepository: AgentRepository;
  private toolRepository: ToolRepository;
  private toolTemplateRepository: ToolTemplateRepository;
  private connectorTemplateRepository: ConnectorTemplateRepository;

  constructor() {
    this.templateRepository = new AgentTemplateRepository();
    this.starshipRepository = new StarshipRepository();
    this.agentRepository = new AgentRepository();
    this.toolRepository = new ToolRepository();
    this.toolTemplateRepository = new ToolTemplateRepository();
    this.connectorTemplateRepository = new ConnectorTemplateRepository();
  }

  /**
   * Validate that the starship can accommodate a new agent
   * @param starshipId The starship ID to check
   * @throws ValidationError if the agent limit is exceeded
   */
  private async validateAgentLimit(starshipId: string): Promise<void> {
    // Get the starship to check its maxAgents limit
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    // Get current deployed agents count
    const currentAgents = await this.starshipRepository.getDeployedAgents(starshipId);

    if (currentAgents.length >= starship.maxAgents) {
      throw new ValidationError(
        `Agent limit reached. Maximum ${starship.maxAgents} agents allowed per starship. Currently deployed: ${currentAgents.length}`
      );
    }
  }

  async getAllTemplates(): Promise<AgentTemplateModel[]> {
    return this.templateRepository.findAll();
  }

  async getTemplateById(id: string): Promise<AgentTemplateModel | null> {
    return this.templateRepository.findById(id);
  }

  async getTemplatesByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.templateRepository.findByCategory(category);
  }

  async searchTemplates(query: string): Promise<AgentTemplateModel[]> {
    return this.templateRepository.searchTemplates(query);
  }

  /**
   * Get required connectors for an agent template (from its tool templates' blueprints).
   * Used by deploy modal to show "Connect these connectors".
   */
  async getRequiredConnectorsForTemplate(templateId: string): Promise<RequiredConnectorItem[]> {
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      throw new NotFoundError('Agent template', templateId);
    }

    const providerIds = await getRequiredConnectorProviderIdsForTemplate(templateId);
    const result: RequiredConnectorItem[] = [];

    for (const provider of providerIds) {
      const connectorTemplate = await this.connectorTemplateRepository.findByProvider(provider);
      if (connectorTemplate) {
        const authType = (connectorTemplate.authJson as { type?: string })?.type ?? 'none';
        result.push({
          provider,
          name: connectorTemplate.name ?? provider,
          description: connectorTemplate.description,
          auth: { type: authType },
        });
      } else {
        result.push({
          provider,
          name: provider,
          auth: { type: 'unknown' },
        });
      }
    }

    return result;
  }

  async createTemplate(
    templateData: CreateAgentTemplateRequest
  ): Promise<AgentTemplateModel> {
    // Validate required fields
    if (!templateData.name || !templateData.model) {
      throw new ValidationError('Template name and model are required');
    }

    // Create template data directly
    return this.templateRepository.create(templateData);
  }

  async updateTemplate(id: string, updates: UpdateAgentTemplateRequest): Promise<AgentTemplateModel | null> {
    return this.templateRepository.update(id, updates);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templateRepository.delete(id);
  }

  async createAgentFromTemplate(templateId: string, starshipId: string): Promise<AgentModel> {
    // Validate agent limit before creating
    await this.validateAgentLimit(starshipId);

    // Get the template to use as a base
    // Important: use INTERNAL template fetch so we retain blueprint/state/systemPrompt.
    // Public findById() intentionally strips these fields for marketplace/client consumption.
    const template = await this.templateRepository.findInternalById(templateId);
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    // Deploy assigned tool templates to the starship as tool instances (track id + slug for permission defaults)
    const deployedTools: Array<{ id: string; slug: string }> = [];

    if (template.assignedToolSlugs && template.assignedToolSlugs.length > 0) {
      console.log(`[AGENT-TEMPLATE-SERVICE] Deploying ${template.assignedToolSlugs.length} tools to starship ${starshipId}`);

      for (const toolSlug of template.assignedToolSlugs) {
        try {
          // `assignedToolSlugs` here comes from the junction table selecting `tool_templates.slug`,
          // so this should be an EXACT template slug. Use a direct slug lookup and then operate by template id.
          const toolTemplate = await this.toolTemplateRepository.findBySlug(toolSlug);
          if (!toolTemplate) {
            console.error(`[AGENT-TEMPLATE-SERVICE] Tool template not found for slug '${toolSlug}'`);
            continue;
          }

          // Check if starship already has a tool from this template (by source_template_id).
          // If it does, we reuse that deployed tool instance (and its slug).
          let existingTool = await this.toolRepository.findByTemplateIdAndStarship(toolTemplate.id, starshipId);

          if (!existingTool) {
            // Create tool instance directly from template id
            existingTool = await this.toolRepository.createFromTemplateId(toolTemplate.id, starshipId);
            console.log(`[AGENT-TEMPLATE-SERVICE] Deployed tool from template '${toolSlug}' to starship ${starshipId}`);
          } else {
            console.log(`[AGENT-TEMPLATE-SERVICE] Tool from template '${toolSlug}' already deployed to starship ${starshipId}`);
          }

          // Track deployed tool ID and slug for relationship creation and permission defaults
          if (existingTool) {
            deployedTools.push({ id: existingTool.id, slug: existingTool.slug ?? toolSlug });
          }
        } catch (error) {
          console.error(`[AGENT-TEMPLATE-SERVICE] Failed to deploy tool '${toolSlug}':`, error);
          // Continue with other tools instead of failing completely
        }
      }
    } else {
      console.log(`[AGENT-TEMPLATE-SERVICE] No assignedToolSlugs found in template for ${templateId}`);
    }

    // Create the agent from template using the proper method that establishes CREATED_FROM relationship
    const agent = await this.agentRepository.createFromTemplate(templateId, starshipId);

    // Establish Agent→Tool relationships with deployed tool instances
    if (deployedTools.length > 0) {
      console.log(`[AGENT-TEMPLATE-SERVICE] Establishing relationships between agent ${agent.id} and ${deployedTools.length} tools`);
      for (const { id: toolId } of deployedTools) {
        try {
          await this.agentRepository.addToolRelationship(agent.id, toolId);
        } catch (error) {
          console.error(`[AGENT-TEMPLATE-SERVICE] Failed to create agent-tool relationship:`, error);
        }
      }
      // Apply template default permissions (publisher's choices) so new agent starts with those defaults
      for (const { slug } of deployedTools) {
        try {
          const permission = template.assignedToolDefaultPermissions?.[slug] ?? 'ask';
          await this.agentRepository.setAgentToolPermissionBySlug({
            agentId: agent.id,
            starshipId,
            toolSlug: slug,
            permission,
          });
        } catch (error) {
          console.error(`[AGENT-TEMPLATE-SERVICE] Failed to set tool permission for ${slug}:`, error);
        }
      }
    }

    return agent;
  }

  // ============================================================================
  // BUSINESS LOGIC METHODS FOR ROUTES LAYER
  // ============================================================================

  async validateStarshipAccess(starshipId: string, userId: string): Promise<StarshipModel> {
    // First try to find by ID
    let starship = await this.starshipRepository.findById(starshipId);

    // If not found by ID, try to find by slug
    if (!starship) {
      starship = await this.starshipRepository.findBySlug(starshipId, userId);
    }

    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    if (starship.ownerId !== userId) {
      throw new ValidationError('Access denied to this starship', 'starshipId');
    }

    return starship;
  }
}
