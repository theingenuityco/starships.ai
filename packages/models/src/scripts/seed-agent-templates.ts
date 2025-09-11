/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { getConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { AgentMemoryState, Blueprint } from '@starships/autopilot';
import { AgentTemplateModel } from '@starships/protocol';

/**
 * Create default blueprint for simple agents
 */
function createSimpleBlueprint(model: string, temperature: number = 0.7, maxTokens: number = 2000): Blueprint {
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
          stream: true, // Enable streaming
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
function createCodeReviewBlueprint(): Blueprint {
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
function createStarshipNavigatorBlueprint(): Blueprint {
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
function createCreativeWritingBlueprint(): Blueprint {
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
          stream: true, // Enable streaming
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
function createSibylMemoryConfig(): AgentMemoryState {
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
function createMemoryConfig(name: string, category: string, description: string, expertise: string[]): AgentMemoryState {
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

  const goals = {
    general: ['Provide clear explanations', 'Encourage learning'],
    coding: ['Write clean code', 'Follow best practices', 'Explain technical concepts'],
    creative: ['Inspire creativity', 'Encourage original thinking', 'Provide fresh perspectives'],
    analysis: ['Present clear insights', 'Support decision-making', 'Identify patterns'],
    support: ['Resolve issues quickly', 'Ensure user satisfaction', 'Provide clear guidance'],
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
      secondary: goals[category as keyof typeof goals] || ['Provide helpful assistance'],
      constraints: ['Be helpful and accurate', 'Follow ethical guidelines', 'Respect user privacy'],
    },
    space: {
      description: `Professional ${category} assistance environment focused on providing accurate and helpful responses.`,
    },
  };
}

// Default templates configuration
const DEFAULT_TEMPLATES: Array<
  Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> & {
    blueprint?: Blueprint;
    memory?: AgentMemoryState;
    executionMode?: 'simple' | 'workflow';
    timeout?: number;
  }
> = [
  {
    name: 'General Assistant',
    slug: 'general-assistant',
    description: 'A helpful general-purpose assistant powered by autopilot workflows for enhanced capabilities.',
    category: 'general',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.7,
    maxTokens: 2000,

    icon: '🤖',
    previewPrompts: ['Help me plan my day', 'Explain quantum computing in simple terms', 'What are some healthy meal ideas?'],
    blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.7, 2000),
    memory: createMemoryConfig('General Assistant', 'general', 'Assist users with general questions and provide helpful information', [
      'general knowledge',
      'conversation',
      'problem solving',
    ]),
    executionMode: 'simple',
    timeout: 30000,
  },
  {
    name: 'Code Reviewer',
    slug: 'code-reviewer',
    description: 'An expert code reviewer with advanced autopilot workflows for comprehensive code analysis and improvement suggestions.',
    category: 'coding',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    maxTokens: 3000,

    icon: '🔍',
    previewPrompts: [
      'Review this JavaScript function for bugs',
      'How can I improve this Python code?',
      'Check this SQL query for security issues',
    ],
    blueprint: createCodeReviewBlueprint(),
    memory: createMemoryConfig('Code Reviewer', 'coding', 'Provide comprehensive, constructive code reviews to improve software quality', [
      'software architecture',
      'code quality',
      'security practices',
      'performance optimization',
    ]),
    executionMode: 'workflow',
    timeout: 60000,
  },
  {
    name: 'Creative Writer',
    slug: 'creative-writer',
    description: 'A creative writing assistant with structured autopilot workflows for ideation, planning, and content creation.',
    category: 'creative',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.8,
    maxTokens: 2500,

    icon: '✍️',
    previewPrompts: [
      'Help me develop a character for my story',
      'Write an opening paragraph for a mystery novel',
      'Give me ideas for a sci-fi short story',
    ],
    blueprint: createCreativeWritingBlueprint(),
    memory: createMemoryConfig('Creative Writer', 'creative', 'Create engaging, original content through a structured creative process', [
      'storytelling',
      'character development',
      'creative writing techniques',
      'content strategy',
    ]),
    executionMode: 'workflow',
    timeout: 45000,
  },
  {
    name: 'Data Analyst',
    slug: 'data-analyst',
    description: 'An analytical assistant powered by autopilot for data interpretation, visualization, and insights.',
    category: 'analysis',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.4,
    maxTokens: 2500,

    icon: '📊',
    previewPrompts: ['Analyze this sales data for trends', 'What statistical test should I use?', 'Help me interpret these survey results'],
    blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.4, 2500),
    memory: createMemoryConfig(
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
    slug: 'customer-support',
    description: 'A friendly customer support assistant with autopilot-powered workflows for issue resolution.',
    category: 'support',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.6,
    maxTokens: 2000,

    icon: '🎧',
    previewPrompts: ['I need help with my account', 'How do I return a product?', "My order hasn't arrived yet"],
    blueprint: createSimpleBlueprint('anthropic/claude-3.5-sonnet', 0.6, 2000),
    memory: createMemoryConfig(
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
    slug: 'sibyl',
    description:
      'Your expert starship navigator and first officer who helps new captains get started, configure their crew, and begin their journey.',
    category: 'general',

    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.5,
    maxTokens: 2000,

    icon: '🧙‍♀️',
    previewPrompts: [
      'Help me set up my new starship',
      'How do I configure my first AI agents?',
      'What should I do first as a new captain?',
    ],
    blueprint: createStarshipNavigatorBlueprint(),
    memory: createSibylMemoryConfig(),
    executionMode: 'workflow',
    timeout: 45000,
  },
];

/**
 * Seeds the database with default agent templates
 * This runs when explicitly called, not on every server startup
 */
export async function seedAgentTemplates(): Promise<void> {
  try {
    logger.info('Starting agent template seeding...');

    // Get the existing connection that was initialized by the server
    const connection = getConnection();

    // Create the agent template repository
    const templateRepo = new AgentTemplateRepository(connection);

    logger.info('Seeding database with default agent templates...');

    let addedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const template of DEFAULT_TEMPLATES) {
      try {
        // Check if template already exists by slug - more reliable than name search
        const existingTemplate = await templateRepo.findBySlug(template.slug as string);

        if (existingTemplate) {
          existingCount++;
          logger.debug(`Agent template already exists: ${template.name} (slug: ${template.slug})`);
        } else {
          // Create the template
          await templateRepo.create({
            ...template,
          });
          addedCount++;
          logger.info(`Agent template created: ${template.name} (slug: ${template.slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(
          `Agent template error processing ${template.name} (slug: ${template.slug}): ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    logger.info(`✅ Agent template seeding completed: ${addedCount} new, ${existingCount} existing, ${errorCount} errors`);
  } catch (error) {
    logger.error(`Failed to seed agent templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      logger.error('Agent template seeding error details', {
        stack: error.stack || 'No stack trace available',
      });
    }
    // Don't throw - we don't want to prevent server startup if template seeding fails
  }
}

// Allow running as standalone script
if (require.main === module) {
  seedAgentTemplates()
    .then(() => {
      console.log('✅ Agent template seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed agent templates:', error);
      process.exit(1);
    });
}
