import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Time Tool Definition
 * Get the current date and time
 */
export const timeTool: ToolParams = {
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
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ input }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'time_1' },
      { ref: 'e2', from: 'time_1', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Time Tool Template Configuration
 */
export const timeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: timeTool.name,
  description: timeTool.description,
  parameters: timeTool.parameters,
  blueprint: timeTool.blueprint,

  slug: 'get-current-time',
  category: 'utility',
  exampleUsage: 'Use in LLM function-calling: { "name": "get_current_time", "arguments": { "timezone": "UTC", "format": "ISO" } }',
  requiresApiKey: false,
  configurationFields: [],
};
