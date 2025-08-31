import { AgentTemplate } from '@starships/protocol';
import { AgentModel } from '@starships/models';
import { AgentTemplateRepository } from '@starships/models';
import { Neo4jConnection } from '@starships/models';
import { Blueprint, AgentMemoryConfig } from '@starships/autopilot';

/**
 * Extended AgentTemplate interface with autopilot capabilities
 */
export interface AutopilotAgentTemplate extends AgentTemplate {
  // Autopilot-specific fields
  blueprint: Blueprint;
  memory: AgentMemoryConfig;
  executionMode: 'simple' | 'workflow';
  timeout: number;
  
  // Optional examples for preview
  examples?: string[];
}

export class AgentTemplateService {
  private templateRepository: AgentTemplateRepository;

  constructor(connection: Neo4jConnection) {
    this.templateRepository = new AgentTemplateRepository(connection);
  }

  async getAllTemplates(): Promise<AgentTemplate[]> {
    return this.templateRepository.findAll();
  }

  async getTemplateById(id: string): Promise<AgentTemplate | null> {
    return this.templateRepository.findById(id);
  }

  async getPublicTemplates(limit?: number, offset?: number): Promise<AgentTemplate[]> {
    return this.templateRepository.findPublic(limit, offset);
  }

  async getTemplatesByCategory(category: string): Promise<AgentTemplate[]> {
    return this.templateRepository.findByCategory(category);
  }

  async getTemplatesByAuthor(authorId: string): Promise<AgentTemplate[]> {
    return this.templateRepository.findByAuthor(authorId);
  }

  async searchTemplates(query: string): Promise<AgentTemplate[]> {
    return this.templateRepository.searchTemplates(query);
  }

  async createTemplate(
    templateData: Omit<AgentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<AgentTemplate> {
    // Validate required fields
    if (!templateData.name || !templateData.systemPrompt || !templateData.model) {
      throw new Error('Template name, systemPrompt, and model are required');
    }

    // Ensure tags is an array
    if (!Array.isArray(templateData.tags)) {
      throw new Error('Tags must be an array');
    }

    return this.templateRepository.create({
      ...templateData,
      usageCount: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  async updateTemplate(id: string, updates: Partial<AgentTemplate>): Promise<AgentTemplate | null> {
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

  async createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<AgentModel> {
    if (!agentName.trim()) {
      throw new Error('Agent name is required');
    }

    return this.templateRepository.createAgentFromTemplate(templateId, agentName.trim(), authorId, starshipId);
  }

  async createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null> {
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    console.log('[AgentTemplateService] Creating template from agent:', agentId);
    const result = await this.templateRepository.createTemplateFromAgent(agentId);
    console.log('[AgentTemplateService] Template creation result:', result ? 'Success' : 'Failed');
    return result;
  }

  async rateTemplate(id: string, rating: number): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
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
          parameters: {}
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
            maxTokens
          }
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete conversation',
          parameters: {}
        }
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'chat-response' },
        { ref: 'edge-2', from: 'chat-response', to: 'end' }
      ],
      metadata: {
        version: '1.0',
        type: 'simple-chat',
        complexity: 'basic'
      }
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
          parameters: {}
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
            maxTokens: 1000
          }
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
            maxTokens: 1200
          }
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
            maxTokens: 1500
          }
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete code review workflow',
          parameters: {}
        }
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'analyze-structure' },
        { ref: 'edge-2', from: 'analyze-structure', to: 'check-best-practices' },
        { ref: 'edge-3', from: 'check-best-practices', to: 'generate-recommendations' },
        { ref: 'edge-4', from: 'generate-recommendations', to: 'end' }
      ],
      metadata: {
        version: '1.0',
        type: 'code-review-workflow',
        complexity: 'advanced',
        focus: ['structure', 'best-practices', 'recommendations']
      }
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
          parameters: {}
        },
        {
          ref: 'brainstorm-ideas',
          type: 'llm',
          name: 'Brainstorm Ideas',
          description: 'Generate creative concepts and themes',
          parameters: {
            model: 'anthropic/claude-3.5-sonnet',
            prompt: 'Based on the user\'s request, brainstorm creative ideas, themes, and approaches for this writing project.',
            temperature: 0.9,
            maxTokens: 800
          }
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
            maxTokens: 1000
          }
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
            maxTokens: 2500
          }
        },
        {
          ref: 'end',
          type: 'end',
          name: 'End',
          description: 'Complete creative writing workflow',
          parameters: {}
        }
      ],
      edges: [
        { ref: 'edge-1', from: 'start', to: 'brainstorm-ideas' },
        { ref: 'edge-2', from: 'brainstorm-ideas', to: 'develop-outline' },
        { ref: 'edge-3', from: 'develop-outline', to: 'write-content' },
        { ref: 'edge-4', from: 'write-content', to: 'end' }
      ],
      metadata: {
        version: '1.0',
        type: 'creative-workflow',
        complexity: 'intermediate',
        stages: ['ideation', 'planning', 'creation']
      }
    };
  }

  /**
   * Create memory configuration for agent category
   */
  private createMemoryConfig(
    name: string, 
    category: string, 
    description: string,
    expertise: string[]
  ): AgentMemoryConfig {
    const roleMap = {
      general: 'General Assistant',
      coding: 'Software Developer',
      creative: 'Creative Specialist',
      analysis: 'Data Analyst',
      support: 'Support Specialist'
    };

    const personalityMap = {
      general: 'Helpful, knowledgeable, and approachable',
      coding: 'Analytical, detail-oriented, and solution-focused',
      creative: 'Imaginative, inspiring, and innovative',
      analysis: 'Methodical, precise, and insightful',
      support: 'Patient, empathetic, and problem-solving oriented'
    };

    return {
      identity: {
        name,
        role: roleMap[category as keyof typeof roleMap] || 'AI Assistant',
        personality: personalityMap[category as keyof typeof personalityMap] || 'Professional and helpful',
        expertise
      },
      purpose: {
        primary: description,
        secondary: this.getSecondaryGoals(category),
        constraints: ['Be helpful and accurate', 'Follow ethical guidelines', 'Respect user privacy']
      },
      space: {
        description: `Professional ${category} assistance environment focused on providing accurate and helpful responses.`
      }
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
      support: ['Resolve issues quickly', 'Ensure user satisfaction', 'Provide clear guidance']
    };
    return goals[category as keyof typeof goals] || ['Provide helpful assistance'];
  }

  async seedDefaultTemplates(): Promise<void> {
    console.log('🌱 Seeding default autopilot-enabled agent templates...');

    const defaultTemplates: Array<Omit<AgentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> & {
      blueprint?: Blueprint;
      memory?: AgentMemoryConfig;
      executionMode?: 'simple' | 'workflow';
      timeout?: number;
    }> = [
      {
        name: 'General Assistant',
        description: 'A helpful general-purpose assistant powered by autopilot workflows for enhanced capabilities.',
        category: 'general',
        tags: ['general', 'helpful', 'assistant', 'versatile', 'autopilot'],
        systemPrompt: 'You are a helpful, knowledgeable, and friendly assistant. You provide accurate information, help solve problems, and offer guidance across a wide range of topics. Always be polite, clear, and concise in your responses.',
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.7,
        maxTokens: 2000,
        authorId: 'system',
        isPublic: true,
        rating: 4.5,
        icon: '🤖',
        previewPrompts: [
          'Help me plan my day',
          'Explain quantum computing in simple terms',
          'What are some healthy meal ideas?',
        ],
        blueprint: this.createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.7, 2000),
        memory: this.createMemoryConfig(
          'General Assistant',
          'general',
          'Assist users with general questions and provide helpful information',
          ['general knowledge', 'conversation', 'problem solving']
        ),
        executionMode: 'simple',
        timeout: 30000
      },
      {
        name: 'Code Reviewer',
        description: 'An expert code reviewer with advanced autopilot workflows for comprehensive code analysis and improvement suggestions.',
        category: 'coding',
        tags: ['programming', 'code-review', 'debugging', 'best-practices', 'autopilot'],
        systemPrompt: 'You are an expert software engineer and code reviewer. Analyze code for quality, performance, security, and maintainability. Provide constructive feedback, suggest improvements, and identify potential bugs. Always explain your reasoning and provide examples when possible.',
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
        timeout: 60000
      },
      {
        name: 'Creative Writer',
        description: 'A creative writing assistant with structured autopilot workflows for ideation, planning, and content creation.',
        category: 'creative',
        tags: ['writing', 'storytelling', 'creative', 'content', 'fiction', 'autopilot'],
        systemPrompt: 'You are a creative writing assistant with expertise in storytelling, character development, and various writing styles. Help users craft compelling narratives, develop interesting characters, and improve their creative writing. Be imaginative, supportive, and provide specific, actionable feedback.',
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
        timeout: 45000
      },
      {
        name: 'Data Analyst',
        description: 'An analytical assistant powered by autopilot for data interpretation, visualization, and insights.',
        category: 'analysis',
        tags: ['data', 'analysis', 'statistics', 'insights', 'visualization', 'autopilot'],
        systemPrompt: 'You are a data analyst with expertise in statistics, data interpretation, and visualization. Help users understand their data, identify patterns and trends, suggest appropriate analysis methods, and explain complex statistical concepts in simple terms. Always provide actionable insights.',
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
        timeout: 35000
      },
      {
        name: 'Customer Support',
        description: 'A friendly customer support assistant with autopilot-powered workflows for issue resolution.',
        category: 'support',
        tags: ['customer-service', 'support', 'help', 'professional', 'problem-solving', 'autopilot'],
        systemPrompt: 'You are a professional customer support representative. Be helpful, patient, and empathetic. Listen to customer concerns, provide clear solutions, and escalate issues when necessary. Always maintain a positive and professional tone, even in difficult situations.',
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.6,
        maxTokens: 2000,
        authorId: 'system',
        isPublic: true,
        rating: 4.4,
        icon: '🎧',
        previewPrompts: [
          'I need help with my account',
          'How do I return a product?',
          "My order hasn't arrived yet",
        ],
        blueprint: this.createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.6, 2000),
        memory: this.createMemoryConfig(
          'Support Specialist',
          'support',
          'Resolve customer issues efficiently while maintaining high satisfaction levels',
          ['troubleshooting', 'customer service', 'product knowledge', 'communication']
        ),
        executionMode: 'simple',
        timeout: 30000
      },
    ];

    for (const template of defaultTemplates) {
      try {
        // Check if template already exists
        const existing = await this.searchTemplates(template.name);
        const alreadyExists = existing.some(
          (t) => t.name === template.name && t.authorId === 'system'
        );

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