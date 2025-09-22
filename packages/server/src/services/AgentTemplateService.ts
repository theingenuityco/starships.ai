import { NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository, AgentTemplateRepository, ToolRepository, Neo4jConnection, StarshipRepository } from '@starships/models';
import { AgentModel, AgentTemplateModel, StarshipModel } from '@starships/protocol';

export class AgentTemplateService {
  private templateRepository: AgentTemplateRepository;
  private starshipRepository: StarshipRepository;
  private agentRepository: AgentRepository;
  private toolRepository: ToolRepository;

  constructor(connection: Neo4jConnection) {
    this.templateRepository = new AgentTemplateRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
    this.agentRepository = new AgentRepository(connection);
    this.toolRepository = new ToolRepository(connection);
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

  async createTemplate(
    templateData: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<AgentTemplateModel> {
    // Validate required fields
    if (!templateData.name || !templateData.model) {
      throw new ValidationError('Template name and model are required');
    }

    // Create template data directly
    return this.templateRepository.create(templateData);
  }

  async updateTemplate(id: string, updates: Partial<AgentTemplateModel>): Promise<AgentTemplateModel | null> {
    // Don't allow updating certain fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _createdAt, ...allowedUpdates } = updates;

    return this.templateRepository.update(id, allowedUpdates) as Promise<AgentTemplateModel | null>;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templateRepository.delete(id);
  }

  async createAgentFromTemplate(templateId: string, starshipId: string): Promise<AgentModel> {
    // Get the template to use as a base
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    // Deploy assigned tool templates to the starship as tool instances
    const deployedToolIds: string[] = [];

    if (template.assignedToolSlugs && template.assignedToolSlugs.length > 0) {
      console.log(`[AGENT-TEMPLATE-SERVICE] Deploying ${template.assignedToolSlugs.length} tools to starship ${starshipId}`);

      for (const toolSlug of template.assignedToolSlugs) {
        try {
          // Check if tool is already deployed to this starship
          let existingTool = await this.toolRepository.findBySlugAndStarship(toolSlug, starshipId);
          if (!existingTool) {
            // Deploy tool from template
            existingTool = await this.toolRepository.createFromTemplate(toolSlug, starshipId);
            console.log(`[AGENT-TEMPLATE-SERVICE] Deployed tool '${toolSlug}' to starship ${starshipId}`);
          } else {
            console.log(`[AGENT-TEMPLATE-SERVICE] Tool '${toolSlug}' already deployed to starship ${starshipId}`);
          }

          // Track deployed tool ID for relationship creation
          if (existingTool) {
            deployedToolIds.push(existingTool.id);
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
    if (deployedToolIds.length > 0) {
      console.log(`[AGENT-TEMPLATE-SERVICE] Establishing relationships between agent ${agent.id} and ${deployedToolIds.length} tools`);
      for (const toolId of deployedToolIds) {
        try {
          await this.agentRepository.addToolRelationship(agent.id, toolId);
        } catch (error) {
          console.error(`[AGENT-TEMPLATE-SERVICE] Failed to create agent-tool relationship:`, error);
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
