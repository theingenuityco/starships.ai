import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Echo Tool Definition
 * Echo back the provided input for testing purposes
 */
export const echoTool: ToolParams = {
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
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: {
            type: 'echo',
            message: '{{ ($lastOutputOf("__initial__")?.[0]?.json?.message) ?? input?.message ?? "" }}',
            metadata: '{{ ($lastOutputOf("__initial__")?.[0]?.json?.metadata) ?? input?.metadata ?? {} }}',
            echoedAt: '{{ new Date().toISOString() }}',
          },
        },
      },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  },
};

/**
 * Echo Tool Template Configuration
 */
export const echoToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: echoTool.name,
  description: echoTool.description,
  parameters: echoTool.parameters,
  blueprint: echoTool.blueprint,

  slug: 'echo',
  category: 'utility',
  exampleUsage: 'Use in LLM function-calling: { "name": "echo", "arguments": { "message": "Hello Tools!" } }',
  requiresApiKey: false,
  configurationFields: [],
};
