import { NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository, AgentTemplateRepository, Neo4jConnection, StarshipRepository } from '@starships/models';
import { AgentModel, AgentTemplateModel, StarshipModel } from '@starships/protocol';

export class AgentTemplateService {
  private templateRepository: AgentTemplateRepository;
  private starshipRepository: StarshipRepository;
  private agentRepository: AgentRepository;

  constructor(connection: Neo4jConnection) {
    this.templateRepository = new AgentTemplateRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
    this.agentRepository = new AgentRepository(connection);
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

  async createAgentFromTemplate(templateId: string, agentName: string, authorId: string, starshipId: string): Promise<AgentModel> {
    if (!agentName.trim()) {
      throw new ValidationError('Agent name is required', 'agentName');
    }

    // Get the template to use as a base
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    // Create agent data based on the template
    const agentData = {
      name: agentName.trim(),
      description: template.description,
      model: template.model,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
      timeout: template.timeout || 30000,
      memoryState: template.memoryState,
      blueprint: template.blueprint,
    };

    // Create the agent using the repository
    const agent = await this.agentRepository.create(agentData, starshipId);

    // Increment the template usage count
    await this.templateRepository.incrementUsageCount(templateId);

    return agent;
  }

  // ============================================================================
  // BUSINESS LOGIC METHODS FOR ROUTES LAYER
  // ============================================================================

  /**
   * Find user's active starship for agent template creation
   */
  async findUserActiveStarship(userId: string): Promise<StarshipModel | null> {
    const userStarships = await this.starshipRepository.findByOwner(userId);
    const activeStarship = userStarships.find((ship) => ship.status === 'active');
    return activeStarship || null;
  }

  /**
   * Validate starship exists and user has access
   */
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
