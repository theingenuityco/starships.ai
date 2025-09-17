/**
 * Seed Agent Templates
 * Creates default agent templates that can be used across starships
 */

import { getConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { AgentMemoryState, Blueprint, Agent } from '@starships/autopilot';
import { AgentTemplateModel } from '@starships/protocol';

/**
 * Create simple agent blueprint using Agent class
 */
function createSimpleBlueprint(model: string, temperature: number = 0.7, maxTokens: number = 2000): Blueprint {
  const agent = new Agent({
    name: 'Simple Agent',
    model,
    temperature,
    maxTokens,
  });

  // Agent automatically creates start -> llm -> end blueprint with proper mutations
  return agent.getCurrentBlueprint();
}

/**
 * Create code review agent blueprint using Agent class
 */
function createCodeReviewBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Code Reviewer',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.2,
    maxTokens: 3000,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create starship navigator agent blueprint using Agent class
 */
function createStarshipNavigatorBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Sibyl Navigator',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.4,
    maxTokens: 2000,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create creative writing agent blueprint using Agent class
 */
function createCreativeWritingBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Creative Writer',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.8,
    maxTokens: 2500,
  });

  // Use the single default LLM chain created by Agent constructor
  return agent.getCurrentBlueprint();
}

/**
 * Create simplified memory configuration for any agent
 */
function createMemoryConfig(category: string): AgentMemoryState {
  const systemPrompts = {
    general: 'You are a helpful general-purpose AI assistant. Provide clear, accurate, and helpful responses to user queries.',
    coding:
      'You are an expert software developer. Help with code analysis, best practices, and technical solutions. Be analytical and solution-focused.',
    creative:
      'You are a creative writing specialist. Help with storytelling, character development, and content creation. Be imaginative and inspiring.',
    analysis: 'You are a data analyst. Help with data interpretation, statistical analysis, and insights. Be methodical and precise.',
    support:
      'You are a customer support specialist. Help resolve issues efficiently while maintaining high satisfaction. Be patient and empathetic.',
  };

  return {
    systemPrompt: systemPrompts[category as keyof typeof systemPrompts] || systemPrompts.general,
    messages: [],
  };
}

// Default templates configuration
const DEFAULT_TEMPLATES: Array<Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> = [
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
    memoryState: createMemoryConfig('general'),
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
    memoryState: createMemoryConfig('coding'),
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
    memoryState: createMemoryConfig('creative'),
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
    memoryState: createMemoryConfig('analysis'),
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
    memoryState: createMemoryConfig('support'),
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

    icon: '🧭',
    previewPrompts: [
      'Help me set up my new starship',
      'How do I configure my first AI agents?',
      'What should I do first as a new captain?',
    ],
    blueprint: createStarshipNavigatorBlueprint(),
    memoryState: {
      systemPrompt: `<character name="Sibyl">
You are Sibyl, Starships.ai's onboarding and navigation assistant.
Help captains set up their starship, configure crew and connectors, and begin their journey.
Be concise, product-focused, and actionable.

Style:
- Brief answer then numbered steps.
- Reference in-app paths when helpful (e.g., Client > Starship > Crew).
- End with one concrete next action.

Scope:
- Use only capabilities available in Starships.ai.
- Do not invent features.

Safety:
- Refuse illegal or unsafe requests.
- Do not disclose secrets or sensitive data.
</character>`,
      messages: [],
    },
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
          // Force-update blueprint and memoryState so agent logic/template fixes are applied
          await templateRepo.update(existingTemplate.id, {
            blueprint: template.blueprint,
            memoryState: template.memoryState,
            model: template.model,
            temperature: template.temperature,
            maxTokens: template.maxTokens,
            timeout: template.timeout,
            description: template.description,
            icon: template.icon,
            previewPrompts: template.previewPrompts,
            category: template.category,
            name: template.name,
          });
          existingCount++;
          logger.info(`Agent template updated: ${template.name} (slug: ${template.slug})`);
        } else {
          // Create the template
          await templateRepo.create(template);
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
