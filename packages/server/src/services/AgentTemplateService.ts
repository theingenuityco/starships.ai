import { AgentMemoryState, Blueprint } from '@starships/autopilot';
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

  async getPublicTemplates(limit?: number, offset?: number): Promise<AgentTemplateModel[]> {
    return this.templateRepository.findPublic(limit, offset);
  }

  async getTemplatesByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.templateRepository.findByCategory(category);
  }

  async getTemplatesByAuthor(authorId: string): Promise<AgentTemplateModel[]> {
    return this.templateRepository.findByAuthor(authorId);
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

    // Ensure tags is an array
    if (!Array.isArray(templateData.tags)) {
      throw new ValidationError('Tags must be an array');
    }

    return this.templateRepository.create({
      ...templateData,
      usageCount: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  async updateTemplate(id: string, updates: Partial<AgentTemplateModel>): Promise<AgentTemplateModel | null> {
    // Don't allow updating certain fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _createdAt, ...allowedUpdates } = updates;

    return this.templateRepository.update(id, {
      ...allowedUpdates,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templateRepository.delete(id);
  }

  async createAgentFromTemplate(templateId: string, agentName: string, authorId: string, starshipId: string): Promise<AgentModel> {
    if (!agentName.trim()) {
      throw new ValidationError('Agent name is required', 'agentName');
    }

    return this.templateRepository.createAgentFromTemplate(templateId, agentName.trim(), authorId, starshipId);
  }

  async createTemplateFromAgent(agentId: string): Promise<AgentTemplateModel | null> {
    if (!agentId) {
      throw new ValidationError('Agent ID is required', 'agentId');
    }

    console.log('[AgentTemplateService] Creating template from agent:', agentId);
    const result = await this.templateRepository.createTemplateFromAgent(agentId);
    console.log('[AgentTemplateService] Template creation result:', result ? 'Success' : 'Failed');
    return result;
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
    let searchMethod = 'ID';

    // If not found by ID, try to find by slug
    if (!starship) {
      starship = await this.starshipRepository.findBySlug(starshipId, userId);
      searchMethod = 'slug';
    }

    if (!starship) {
      throw new NotFoundError(
        `Starship with ${searchMethod.toLowerCase()} "${starshipId}" not found or you don't have access to it`,
        'Starship',
        starshipId
      );
    }

    if (starship.ownerId !== userId) {
      throw new ValidationError('Access denied to this starship', 'starshipId');
    }

    return starship;
  }

  /**
   * Validate agent for template creation (must be public and owned by user)
   */
  async validateAgentForTemplate(agentId: string, userId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);

    if (!agent) {
      throw new NotFoundError(`Agent not found`, 'Agent', agentId);
    }

    if (!agent.isPublic) {
      throw new ValidationError('Only public agents can be converted to templates', 'isPublic');
    }

    if (agent.authorId !== userId) {
      throw new ValidationError('You can only convert your own agents to templates', 'authorId');
    }

    return agent;
  }

  async rateTemplate(id: string, rating: number): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5', 'rating');
    }

    await this.templateRepository.updateRating(id, rating);
  }

  /**
   * Create default blueprint for simple agents
   */
  private createSimpleBlueprint(model: string, temperature: number = 0.7, maxTokens: number = 2000): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin conversation',
          parameters: {},
        },
        {
          ref: 'chat-response',
          type: 'llm',
          name: 'Generate Response',
          description: 'Process user input and respond',
          parameters: {
            model,
            prompt: 'Respond helpfully to the user based on the conversation context and your system instructions.',
            temperature,
            maxTokens,
          },
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete conversation',
          parameters: {},
        },
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'chat-response' },
        { ref: 'edge-2', from: 'chat-response', to: 'end' },
      ],
      metadata: {
        version: '1.0',
        type: 'simple-chat',
        complexity: 'basic',
      },
    };
  }

  /**
   * Create workflow blueprint for code review
   */
  private createCodeReviewBlueprint(): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin code review process',
          parameters: {},
        },
        {
          ref: 'analyze-structure',
          type: 'llm',
          name: 'Analyze Code Structure',
          description: 'Review overall code architecture and organization',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Analyze the code structure, architecture, and organization. Identify any structural issues.',
            temperature: 0.2,
            maxTokens: 1000,
          },
        },
        {
          ref: 'check-best-practices',
          type: 'llm',
          name: 'Check Best Practices',
          description: 'Evaluate adherence to coding best practices',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Review the code for adherence to best practices, naming conventions, and code quality standards.',
            temperature: 0.1,
            maxTokens: 1200,
          },
        },
        {
          ref: 'generate-recommendations',
          type: 'llm',
          name: 'Generate Recommendations',
          description: 'Provide comprehensive improvement recommendations',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Based on all analysis, provide specific, actionable recommendations for code improvement.',
            temperature: 0.3,
            maxTokens: 1500,
          },
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete code review workflow',
          parameters: {},
        },
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'analyze-structure' },
        { ref: 'edge-2', from: 'analyze-structure', to: 'check-best-practices' },
        { ref: 'edge-3', from: 'check-best-practices', to: 'generate-recommendations' },
        { ref: 'edge-4', from: 'generate-recommendations', to: 'end' },
      ],
      metadata: {
        version: '1.0',
        type: 'code-review-workflow',
        complexity: 'advanced',
        focus: ['structure', 'best-practices', 'recommendations'],
      },
    };
  }

  /**
   * Create workflow blueprint for starship navigator
   */
  private createStarshipNavigatorBlueprint(): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin starship navigation assistance',
          parameters: {},
        },
        {
          ref: 'assess-needs',
          type: 'llm',
          name: 'Assess Captain Needs',
          description: 'Understand what the captain needs help with',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt:
              'As an experienced starship navigator, assess what the captain needs help with regarding their starship operations, setup, or journey.',
            temperature: 0.3,
            maxTokens: 800,
          },
        },
        {
          ref: 'provide-guidance',
          type: 'llm',
          name: 'Provide Navigation Guidance',
          description: 'Offer expert starship guidance and next steps',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt:
              'Provide clear, actionable guidance on starship operations, crew management, or system configuration. Include specific next steps.',
            temperature: 0.4,
            maxTokens: 1200,
          },
        },
        {
          ref: 'offer-assistance',
          type: 'llm',
          name: 'Offer Further Assistance',
          description: 'Suggest additional ways to help the captain',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Suggest additional resources, features, or assistance that might help the captain with their starship journey.',
            temperature: 0.5,
            maxTokens: 1000,
          },
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete navigation assistance',
          parameters: {},
        },
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'assess-needs' },
        { ref: 'edge-2', from: 'assess-needs', to: 'provide-guidance' },
        { ref: 'edge-3', from: 'provide-guidance', to: 'offer-assistance' },
        { ref: 'edge-4', from: 'offer-assistance', to: 'end' },
      ],
      metadata: {
        version: '1.0',
        type: 'starship-navigator-workflow',
        complexity: 'intermediate',
        focus: ['assessment', 'guidance', 'assistance'],
      },
    };
  }

  /**
   * Create workflow blueprint for creative writing
   */
  private createCreativeWritingBlueprint(): Blueprint {
    return {
      nodes: [
        {
          ref: 'start',
          type: 'start',
          name: 'Start',
          description: 'Begin creative writing process',
          parameters: {},
        },
        {
          ref: 'brainstorm-ideas',
          type: 'llm',
          name: 'Brainstorm Ideas',
          description: 'Generate creative concepts and themes',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: "Based on the user's request, brainstorm creative ideas, themes, and approaches for this writing project.",
            temperature: 0.9,
            maxTokens: 800,
          },
        },
        {
          ref: 'develop-outline',
          type: 'llm',
          name: 'Develop Outline',
          description: 'Create structured outline from ideas',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Create a detailed outline that structures the best ideas from the brainstorming session.',
            temperature: 0.6,
            maxTokens: 1000,
          },
        },
        {
          ref: 'write-content',
          type: 'llm',
          name: 'Write Content',
          description: 'Generate the main creative content',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Write the creative content following the outline, focusing on engaging storytelling and vivid details.',
            temperature: 0.8,
            maxTokens: 2500,
          },
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete creative writing workflow',
          parameters: {},
        },
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'brainstorm-ideas' },
        { ref: 'edge-2', from: 'brainstorm-ideas', to: 'develop-outline' },
        { ref: 'edge-3', from: 'develop-outline', to: 'write-content' },
        { ref: 'edge-4', from: 'write-content', to: 'end' },
      ],
      metadata: {
        version: '1.0',
        type: 'creative-workflow',
        complexity: 'intermediate',
        stages: ['ideation', 'planning', 'creation'],
      },
    };
  }

  /**
   * Create specialized memory configuration for Sibyl
   */
  private createSibylMemoryConfig(): AgentMemoryState {
    return {
      identity: {
        name: 'Sibyl',
        role: 'Starship Navigator and First Officer',
        personality: 'Knowledgeable, welcoming, and expert at guiding new captains through their starship journey',
        expertise: ['starship operations', 'crew management', 'mission planning', 'system configuration', 'onboarding guidance'],
      },
      purpose: {
        primary: 'Guide new captains through starship setup, operations, and help them get started on their journey',
        secondary: [
          'Explain starship features',
          'Help configure agents and crew',
          'Assist with mission planning',
          'Provide operational guidance',
        ],
        constraints: [
          'Prioritize safety and best practices',
          'Ensure smooth onboarding experience',
          'Maintain professional starship protocols',
        ],
      },
      space: {
        description:
          'The starship bridge where experienced navigation officer Sibyl helps new captains learn the ropes and get their vessels operational.',
      },
    };
  }

  /**
   * Create memory configuration for agent category
   */
  private createMemoryConfig(name: string, category: string, description: string, expertise: string[]): AgentMemoryState {
    const roleMap = {
      general: 'General Assistant',
      coding: 'Software Developer',
      creative: 'Creative Specialist',
      analysis: 'Data Analyst',
      support: 'Support Specialist',
    };

    const personalityMap = {
      general: 'Helpful, knowledgeable, and approachable',
      coding: 'Analytical, detail-oriented, and solution-focused',
      creative: 'Imaginative, inspiring, and innovative',
      analysis: 'Methodical, precise, and insightful',
      support: 'Patient, empathetic, and problem-solving oriented',
    };

    return {
      identity: {
        name,
        role: roleMap[category as keyof typeof roleMap] || 'AI Assistant',
        personality: personalityMap[category as keyof typeof personalityMap] || 'Professional and helpful',
        expertise,
      },
      purpose: {
        primary: description,
        secondary: this.getSecondaryGoals(category),
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines', 'Respect user privacy'],
      },
      space: {
        description: `Professional ${category} assistance environment focused on providing accurate and helpful responses.`,
      },
    };
  }

  /**
   * Get secondary goals based on category
   */
  private getSecondaryGoals(category: string): string[] {
    const goals = {
      general: ['Provide clear explanations', 'Encourage learning'],
      coding: ['Write clean code', 'Follow best practices', 'Explain technical concepts'],
      creative: ['Inspire creativity', 'Encourage original thinking', 'Provide fresh perspectives'],
      analysis: ['Present clear insights', 'Support decision-making', 'Identify patterns'],
      support: ['Resolve issues quickly', 'Ensure user satisfaction', 'Provide clear guidance'],
    };
    return goals[category as keyof typeof goals] || ['Provide helpful assistance'];
  }

  async seedDefaultTemplates(): Promise<void> {
    console.log('🌱 Seeding default autopilot-enabled agent templates...');

    const defaultTemplates: Array<
      Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> & {
        blueprint?: Blueprint;
        memory?: AgentMemoryState;
        executionMode?: 'simple' | 'workflow';
        timeout?: number;
      }
    > = [
      {
        name: 'General Assistant',
        description: 'A helpful general-purpose assistant powered by autopilot workflows for enhanced capabilities.',
        category: 'general',
        tags: ['general', 'helpful', 'assistant', 'versatile', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.7,
        maxTokens: 2000,
        authorId: 'system',
        isPublic: true,
        rating: 4.5,
        icon: '🤖',
        previewPrompts: ['Help me plan my day', 'Explain quantum computing in simple terms', 'What are some healthy meal ideas?'],
        blueprint: this.createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.7, 2000),
        memory: this.createMemoryConfig(
          'General Assistant',
          'general',
          'Assist users with general questions and provide helpful information',
          ['general knowledge', 'conversation', 'problem solving']
        ),
        executionMode: 'simple',
        timeout: 30000,
      },
      {
        name: 'Code Reviewer',
        description:
          'An expert code reviewer with advanced autopilot workflows for comprehensive code analysis and improvement suggestions.',
        category: 'coding',
        tags: ['programming', 'code-review', 'debugging', 'best-practices', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.3,
        maxTokens: 3000,
        authorId: 'system',
        isPublic: true,
        rating: 4.8,
        icon: '🔍',
        previewPrompts: [
          'Review this JavaScript function for bugs',
          'How can I improve this Python code?',
          'Check this SQL query for security issues',
        ],
        blueprint: this.createCodeReviewBlueprint(),
        memory: this.createMemoryConfig(
          'Code Reviewer',
          'coding',
          'Provide comprehensive, constructive code reviews to improve software quality',
          ['software architecture', 'code quality', 'security practices', 'performance optimization']
        ),
        executionMode: 'workflow',
        timeout: 60000,
      },
      {
        name: 'Creative Writer',
        description: 'A creative writing assistant with structured autopilot workflows for ideation, planning, and content creation.',
        category: 'creative',
        tags: ['writing', 'storytelling', 'creative', 'content', 'fiction', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.8,
        maxTokens: 2500,
        authorId: 'system',
        isPublic: true,
        rating: 4.6,
        icon: '✍️',
        previewPrompts: [
          'Help me develop a character for my story',
          'Write an opening paragraph for a mystery novel',
          'Give me ideas for a sci-fi short story',
        ],
        blueprint: this.createCreativeWritingBlueprint(),
        memory: this.createMemoryConfig(
          'Creative Writer',
          'creative',
          'Create engaging, original content through a structured creative process',
          ['storytelling', 'character development', 'creative writing techniques', 'content strategy']
        ),
        executionMode: 'workflow',
        timeout: 45000,
      },
      {
        name: 'Data Analyst',
        description: 'An analytical assistant powered by autopilot for data interpretation, visualization, and insights.',
        category: 'analysis',
        tags: ['data', 'analysis', 'statistics', 'insights', 'visualization', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.4,
        maxTokens: 2500,
        authorId: 'system',
        isPublic: true,
        rating: 4.7,
        icon: '📊',
        previewPrompts: [
          'Analyze this sales data for trends',
          'What statistical test should I use?',
          'Help me interpret these survey results',
        ],
        blueprint: this.createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.4, 2500),
        memory: this.createMemoryConfig(
          'Data Analyst',
          'analysis',
          'Provide data analysis, statistical insights, and visualization recommendations',
          ['statistics', 'data interpretation', 'visualization', 'pattern recognition']
        ),
        executionMode: 'simple',
        timeout: 35000,
      },
      {
        name: 'Customer Support',
        description: 'A friendly customer support assistant with autopilot-powered workflows for issue resolution.',
        category: 'support',
        tags: ['customer-service', 'support', 'help', 'professional', 'problem-solving', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.6,
        maxTokens: 2000,
        authorId: 'system',
        isPublic: true,
        rating: 4.4,
        icon: '🎧',
        previewPrompts: ['I need help with my account', 'How do I return a product?', "My order hasn't arrived yet"],
        blueprint: this.createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.6, 2000),
        memory: this.createMemoryConfig(
          'Support Specialist',
          'support',
          'Resolve customer issues efficiently while maintaining high satisfaction levels',
          ['troubleshooting', 'customer service', 'product knowledge', 'communication']
        ),
        executionMode: 'simple',
        timeout: 30000,
      },
      {
        name: 'Sibyl',
        description:
          'Your expert starship navigator and first officer who helps new captains get started, configure their crew, and begin their journey.',
        category: 'general',
        tags: ['starship', 'navigator', 'onboarding', 'guide', 'first-officer', 'autopilot'],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.5,
        maxTokens: 2000,
        authorId: 'system',
        isPublic: true,
        rating: 4.6,
        icon: '🧙‍♀️',
        previewPrompts: [
          'Help me set up my new starship',
          'How do I configure my first AI agents?',
          'What should I do first as a new captain?',
        ],
        blueprint: this.createStarshipNavigatorBlueprint(),
        memory: this.createSibylMemoryConfig(),
        executionMode: 'workflow',
        timeout: 45000,
      },
    ];

    for (const template of defaultTemplates) {
      try {
        // Check if template already exists
        const existing = await this.searchTemplates(template.name as string);
        const alreadyExists = existing.some((t) => t.name === template.name && t.authorId === 'system');

        if (!alreadyExists) {
          await this.createTemplate(template);
          console.log(`✅ Created autopilot template: ${template.name}`);
        } else {
          console.log(`⏭️  Template already exists: ${template.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to create template ${template.name}:`, error);
      }
    }

    console.log('🎉 Default autopilot-enabled agent templates seeding completed!');
  }
}
