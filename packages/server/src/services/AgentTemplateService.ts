import { AgentTemplate } from '@starships/protocol';
import { AgentModel } from '@starships/models';
import { AgentTemplateRepository } from '@starships/models';
import { Neo4jConnection } from '@starships/models';

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

  async seedDefaultTemplates(): Promise<void> {
    console.log('🌱 Seeding default agent templates...');

    const defaultTemplates: Omit<AgentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>[] =
      [
        {
          name: 'General Assistant',
          description:
            'A helpful general-purpose assistant that can help with various tasks, answer questions, and provide guidance.',
          category: 'general',
          tags: ['general', 'helpful', 'assistant', 'versatile'],
          systemPrompt:
            'You are a helpful, knowledgeable, and friendly assistant. You provide accurate information, help solve problems, and offer guidance across a wide range of topics. Always be polite, clear, and concise in your responses.',
          model: 'gpt-4o',
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
        },
        {
          name: 'Code Reviewer',
          description:
            'An expert code reviewer that analyzes code quality, suggests improvements, and identifies potential bugs.',
          category: 'coding',
          tags: ['programming', 'code-review', 'debugging', 'best-practices'],
          systemPrompt:
            'You are an expert software engineer and code reviewer. Analyze code for quality, performance, security, and maintainability. Provide constructive feedback, suggest improvements, and identify potential bugs. Always explain your reasoning and provide examples when possible.',
          model: 'gpt-4o',
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
        },
        {
          name: 'Creative Writer',
          description:
            'A creative writing assistant that helps with storytelling, character development, and creative content.',
          category: 'creative',
          tags: ['writing', 'storytelling', 'creative', 'content', 'fiction'],
          systemPrompt:
            'You are a creative writing assistant with expertise in storytelling, character development, and various writing styles. Help users craft compelling narratives, develop interesting characters, and improve their creative writing. Be imaginative, supportive, and provide specific, actionable feedback.',
          model: 'gpt-4o',
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
        },
        {
          name: 'Data Analyst',
          description:
            'An analytical assistant that helps interpret data, create visualizations, and provide insights.',
          category: 'analysis',
          tags: ['data', 'analysis', 'statistics', 'insights', 'visualization'],
          systemPrompt:
            'You are a data analyst with expertise in statistics, data interpretation, and visualization. Help users understand their data, identify patterns and trends, suggest appropriate analysis methods, and explain complex statistical concepts in simple terms. Always provide actionable insights.',
          model: 'gpt-4o',
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
        },
        {
          name: 'Customer Support',
          description:
            'A friendly customer support assistant that helps resolve issues and answer questions professionally.',
          category: 'support',
          tags: ['customer-service', 'support', 'help', 'professional', 'problem-solving'],
          systemPrompt:
            'You are a professional customer support representative. Be helpful, patient, and empathetic. Listen to customer concerns, provide clear solutions, and escalate issues when necessary. Always maintain a positive and professional tone, even in difficult situations.',
          model: 'gpt-4o',
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
          console.log(`✅ Created template: ${template.name}`);
        } else {
          console.log(`⏭️  Template already exists: ${template.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to create template ${template.name}:`, error);
      }
    }

    console.log('🎉 Default agent templates seeding completed!');
  }
}