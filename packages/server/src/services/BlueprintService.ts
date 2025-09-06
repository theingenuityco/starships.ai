import { BlueprintRepository, EdgeRepository, NodeRepository } from '@starships/models';
import { BlueprintModel, CreateBlueprintRequest, UpdateBlueprintRequest } from '@starships/protocol';

/**
 * Blueprint Service - Contains business logic for blueprint operations
 */
export class BlueprintService {
  private blueprintRepository: BlueprintRepository;
  private nodeRepository: NodeRepository;
  private edgeRepository: EdgeRepository;

  constructor() {
    this.blueprintRepository = new BlueprintRepository();
    this.nodeRepository = new NodeRepository();
    this.edgeRepository = new EdgeRepository();
  }

  /**
   * Create a new blueprint with nodes and edges
   */
  async createBlueprint(data: CreateBlueprintRequest): Promise<BlueprintModel> {
    return this.blueprintRepository.createBlueprint(data);
  }

  /**
   * Get blueprint by ID with all nodes and edges
   */
  async getBlueprintById(blueprintId: string): Promise<BlueprintModel | null> {
    return this.blueprintRepository.getBlueprintById(blueprintId);
  }

  /**
   * Get all blueprints
   */
  async getAllBlueprints(): Promise<BlueprintModel[]> {
    return this.blueprintRepository.getAllBlueprints();
  }

  /**
   * Get blueprints by category
   */
  async getBlueprintsByCategory(category: string): Promise<BlueprintModel[]> {
    return this.blueprintRepository.getBlueprintsByCategory(category);
  }

  /**
   * Update blueprint
   */
  async updateBlueprint(blueprintId: string, updates: UpdateBlueprintRequest): Promise<BlueprintModel | null> {
    return this.blueprintRepository.updateBlueprint(blueprintId, updates);
  }

  /**
   * Delete blueprint and all associated nodes and edges
   */
  async deleteBlueprint(blueprintId: string): Promise<void> {
    await this.blueprintRepository.deleteBlueprint(blueprintId);
  }

  /**
   * Increment usage count for a blueprint (business logic)
   */
  async trackBlueprintUsage(blueprintId: string): Promise<void> {
    // Business logic: Check if blueprint exists before incrementing
    const blueprint = await this.blueprintRepository.getBlueprintById(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    await this.blueprintRepository.incrementUsageCount(blueprintId);
  }

  /**
   * Clone a blueprint with new name and optional modifications
   */
  async cloneBlueprint(
    sourceBlueprintId: string,
    newName: string,
    modifications?: Partial<CreateBlueprintRequest>
  ): Promise<BlueprintModel> {
    // Business logic: Get source blueprint
    const sourceBlueprint = await this.blueprintRepository.getBlueprintById(sourceBlueprintId);
    if (!sourceBlueprint) {
      throw new Error(`Source blueprint not found: ${sourceBlueprintId}`);
    }

    // Create clone data
    const cloneData: CreateBlueprintRequest = {
      name: newName,
      description: modifications?.description || `Clone of ${sourceBlueprint.name}`,
      category: modifications?.category || sourceBlueprint.category || 'general',
      nodes: modifications?.nodes || sourceBlueprint.nodes,
      edges: modifications?.edges || sourceBlueprint.edges,
      metadata: {
        ...sourceBlueprint.metadata,
        ...modifications?.metadata,
        clonedFrom: sourceBlueprintId,
        clonedAt: new Date().toISOString(),
      },
    };

    return this.createBlueprint(cloneData);
  }

  /**
   * Get blueprint usage statistics (business logic)
   */
  async getBlueprintStats(blueprintId: string): Promise<{
    blueprint: BlueprintModel;
    nodeCount: number;
    edgeCount: number;
    usageCount: number;
  } | null> {
    const blueprint = await this.blueprintRepository.getBlueprintById(blueprintId);
    if (!blueprint) return null;

    return {
      blueprint,
      nodeCount: blueprint.nodes?.length || 0,
      edgeCount: blueprint.edges?.length || 0,
      usageCount: blueprint.usageCount || 0,
    };
  }

  /**
   * Get popular blueprints (business logic for sorting and filtering)
   */
  async getPopularBlueprints(limit: number = 10): Promise<BlueprintModel[]> {
    const allBlueprints = await this.blueprintRepository.getAllBlueprints();

    // Business logic: Sort by usage count and limit results
    return allBlueprints.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, limit);
  }

  /**
   * Search blueprints by name or description (business logic)
   */
  async searchBlueprints(query: string, category?: string): Promise<BlueprintModel[]> {
    let blueprints: BlueprintModel[];

    if (category) {
      blueprints = await this.blueprintRepository.getBlueprintsByCategory(category);
    } else {
      blueprints = await this.blueprintRepository.getAllBlueprints();
    }

    // Business logic: Filter by search query
    const searchTerm = query.toLowerCase();
    return blueprints.filter(
      (blueprint) => blueprint.name?.toLowerCase().includes(searchTerm) || blueprint.description?.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Validate blueprint structure (business logic)
   */
  async validateBlueprintStructure(blueprintId: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const blueprint = await this.blueprintRepository.getBlueprintById(blueprintId);
    if (!blueprint) {
      return {
        isValid: false,
        errors: ['Blueprint not found'],
      };
    }

    const errors: string[] = [];

    // Business validation rules
    if (!blueprint.nodes || blueprint.nodes.length === 0) {
      errors.push('Blueprint must have at least one node');
    }

    if (blueprint.edges && blueprint.edges.length > 0) {
      // Validate edge references
      const nodeIds = new Set(blueprint.nodes.map((node: any) => node.id));
      blueprint.edges.forEach((edge, index) => {
        if (!nodeIds.has(edge.from)) {
          errors.push(`Edge ${index}: 'from' node '${edge.from}' does not exist`);
        }
        if (!nodeIds.has(edge.to)) {
          errors.push(`Edge ${index}: 'to' node '${edge.to}' does not exist`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
