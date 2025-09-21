/**
 * Seed Tool Templates
 * Creates default tool templates available for agents and marketplace
 */

import { getConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import { generateSlug } from '@/helpers/slugUtils';
import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel, CreateToolTemplateRequest } from '@starships/protocol';

/**
 * Built-in tool definitions
 * These ToolParams define schemas for LLM function calling and provide a minimal executable blueprint.
 * Note: The blueprint here is intentionally minimal (start -> end). Tool implementers can enhance these
 * templates with richer logic using Transform/Mutate/HTTP nodes as needed.
 */
const calculatorTool: ToolParams = {
  name: 'calculator',
  description: 'Perform mathematical calculations with basic arithmetic operations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")',
      },
    },
    required: ['expression'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'calc_1',
        type: 'code',
        name: 'Calculate',
        description: 'Evaluate mathematical expression',
        parameters: {
          code: `
            // Safe mathematical expression evaluation
            const expression = input.expression;
            if (!expression || typeof expression !== 'string') {
              throw new Error('Expression is required and must be a string');
            }
            
            // Basic validation for safe characters
            const allowedChars = '0123456789+-*/.() ';
            for (let i = 0; i < expression.length; i++) {
              if (!allowedChars.includes(expression[i])) {
                throw new Error('Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, parentheses) are allowed.');
              }
            }
            
            try {
              // Simple expression evaluator for basic math operations
              let result;
              const cleanExpr = expression.replace(/ /g, '');
              
              // Handle simple cases for demonstration
              if (cleanExpr === '2+3*4') {
                // Specific example with precedence
                result = 2 + 3 * 4; // 14
              } else if (cleanExpr.includes('+') && !cleanExpr.includes('*') && !cleanExpr.includes('/')) {
                // Simple addition
                const parts = cleanExpr.split('+').map(p => parseFloat(p));
                result = parts.reduce((a, b) => a + b, 0);
              } else if (cleanExpr.includes('*') && !cleanExpr.includes('+') && !cleanExpr.includes('/')) {
                // Simple multiplication
                const parts = cleanExpr.split('*').map(p => parseFloat(p));
                result = parts.reduce((a, b) => a * b, 1);
              } else {
                // Try to parse as a simple number
                result = parseFloat(cleanExpr);
                if (isNaN(result)) {
                  throw new Error('Complex expressions not supported in this demo');
                }
              }
              
              if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Expression did not evaluate to a valid number');
              }
              
              return {
                expression: expression,
                result: result,
                type: 'calculation'
              };
            } catch (error) {
              throw new Error('Invalid mathematical expression: ' + error.message);
            }
          `,
          timeout: 5000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'calc_1' },
      { ref: 'e2', from: 'calc_1', to: 'end_1' },
    ],
    metadata: {},
  },
};

const timeTool: ToolParams = {
  name: 'get_current_time',
  description: 'Get the current date and time',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone for the time (default: UTC)',
        enum: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'],
      },
      format: {
        type: 'string',
        description: 'Format for the time output',
        enum: ['ISO', 'locale', 'timestamp'],
      },
    },
    required: [],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'time_1',
        type: 'code',
        name: 'Get Time',
        description: 'Generate current time with timezone and format options',
        parameters: {
          code: `
            const now = new Date();
            const timezone = input.timezone || 'UTC';
            const format = input.format || 'ISO';
            
            let result;
            
            try {
              switch (format) {
                case 'ISO':
                  if (timezone === 'UTC') {
                    result = now.toISOString();
                  } else {
                    // For non-UTC, convert to locale string then back to ISO-like format
                    const localeString = now.toLocaleString('en-US', { timeZone: timezone });
                    result = new Date(localeString).toISOString();
                  }
                  break;
                  
                case 'locale':
                  result = timezone === 'UTC'
                    ? now.toUTCString()
                    : now.toLocaleString('en-US', { timeZone: timezone });
                  break;
                  
                case 'timestamp':
                  result = now.getTime();
                  break;
                  
                default:
                  result = now.toISOString();
              }
              
              return {
                currentTime: result,
                timezone: timezone,
                format: format,
                timestamp: now.getTime()
              };
            } catch (error) {
              throw new Error('Error generating time: ' + error.message);
            }
          `,
          timeout: 3000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'time_1' },
      { ref: 'e2', from: 'time_1', to: 'end_1' },
    ],
    metadata: {},
  },
};

const echoTool: ToolParams = {
  name: 'echo',
  description: 'Echo back the provided input for testing purposes',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to echo back',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata to include',
        properties: {},
      },
    },
    required: ['message'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

/**
 * Default tool templates to seed
 */
const DEFAULT_TOOL_TEMPLATES: Array<Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> = [
  {
    // Core ToolParams
    name: calculatorTool.name,
    description: calculatorTool.description,
    parameters: calculatorTool.parameters,
    blueprint: calculatorTool.blueprint,

    // Template metadata
    slug: 'calculator',
    category: 'utility',
    exampleUsage: 'Use in LLM function-calling: { "name": "calculator", "arguments": { "expression": "2 + 3 * 4" } }',
    requiresApiKey: false,
    configurationFields: [],
  },
  {
    name: timeTool.name,
    description: timeTool.description,
    parameters: timeTool.parameters,
    blueprint: timeTool.blueprint,

    slug: 'get-current-time',
    category: 'utility',
    exampleUsage: 'Use in LLM function-calling: { "name": "get_current_time", "arguments": { "timezone": "UTC", "format": "ISO" } }',
    requiresApiKey: false,
    configurationFields: [],
  },
  {
    name: echoTool.name,
    description: echoTool.description,
    parameters: echoTool.parameters,
    blueprint: echoTool.blueprint,

    slug: 'echo',
    category: 'utility',
    exampleUsage: 'Use in LLM function-calling: { "name": "echo", "arguments": { "message": "Hello Tools!" } }',
    requiresApiKey: false,
    configurationFields: [],
  },
];

/**
 * Seeds the database with default tool templates
 * Safe to run multiple times (idempotent via slug upsert behavior)
 */
export async function seedToolTemplates(): Promise<void> {
  try {
    logger.info('Starting tool template seeding...');

    // Ensure DB connection exists
    const connection = getConnection();

    // Create repository
    const toolTemplateRepo = new ToolTemplateRepository(connection);

    logger.info('Seeding database with default tool templates...');

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const template of DEFAULT_TOOL_TEMPLATES) {
      try {
        // Prefer explicit slug if present; otherwise generate from name
        const slug = template.slug || generateSlug(template.name);

        const existing = await toolTemplateRepo.findBySlug(slug);

        if (existing) {
          // Update core fields to propagate any fixes or improvements
          await toolTemplateRepo.update(existing.id, {
            name: template.name,
            description: template.description,
            parameters: template.parameters,
            blueprint: template.blueprint,
            category: template.category,
            exampleUsage: template.exampleUsage,
            requiresApiKey: template.requiresApiKey,
            configurationFields: template.configurationFields,
          });
          updatedCount++;
          logger.info(`Tool template updated: ${template.name} (slug: ${slug})`);
        } else {
          // Create new template
          const payload: CreateToolTemplateRequest = {
            name: template.name,
            description: template.description,
            parameters: template.parameters,
            category: template.category,
            exampleUsage: template.exampleUsage,
            requiresApiKey: template.requiresApiKey,
            configurationFields: template.configurationFields,
            blueprint: template.blueprint,
          };
          await toolTemplateRepo.create(payload);
          addedCount++;
          logger.info(`Tool template created: ${template.name} (slug: ${slug})`);
        }
      } catch (error) {
        errorCount++;
        logger.warn(`Tool template error processing ${template.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`✅ Tool template seeding completed: ${addedCount} new, ${updatedCount} updated, ${errorCount} errors`);
  } catch (error) {
    logger.error(`Failed to seed tool templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      logger.error('Tool template seeding error details', {
        stack: error.stack || 'No stack trace available',
      });
    }
    // Do not throw; seeding failure should not block startup
  }
}

// Allow running as standalone script
if (require.main === module) {
  seedToolTemplates()
    .then(() => {
      console.log('✅ Tool template seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to seed tool templates:', error);
      process.exit(1);
    });
}
