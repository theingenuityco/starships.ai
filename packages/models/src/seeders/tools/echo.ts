import type { ToolParams } from '@starships/autopilot';

/**
 * Echo Tool Definition
 * Echo back the provided input for testing purposes
 */
export const echoTool: ToolParams = {
  name: 'Echo',
  slug: 'echo',
  description: 'Echo back the provided input for testing purposes.',
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
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: {
            type: 'echo',
            message: '{{ (lastOutputOf("__initial__") || {}).message }}',
            metadata: '{{ (lastOutputOf("__initial__") || {}).metadata ?? {} }}',
            echoedAt: '{{ new Date().toISOString() }}',
          },
        },
      },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

