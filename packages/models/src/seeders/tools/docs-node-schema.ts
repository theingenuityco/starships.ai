import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Node Schema Introspection
 * Provides comprehensive schema information for Autopilot node types
 */
export const nodeSchemaIntrospectionTool: ToolParams = {
  name: 'Docs Node Schema',
  slug: 'docs-node-schema',
  description: `Fetch static markdown documentation for Autopilot node types.

## Purpose
Provides concise, static documentation for all Autopilot node types.

## Query Capabilities
- **Specific Node Type**: Get markdown for a single node type
- **All Node Types**: List all available node types with brief descriptions

## Node Types Available
start, end, llm, agent, http_request, conditional, transform, mutate, tool, workflow, code, user_prompt

## Response Format
Returns markdown content string under data.content.`,
  parameters: {
    type: 'object',
    properties: {
      nodeType: {
        type: 'string',
        enum: [
          'all', // List all node types
          'start',
          'end',
          'llm',
          'agent',
          'http_request',
          'conditional',
          'transform',
          'mutate',
          'tool',
          'workflow',
          'code',
          'user_prompt',
        ],
        description: 'Node type to query schema for, or "all" to list all types',
      },
    },
    required: ['nodeType'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers for /api/v1/docs (node-schema)',
        parameters: {
          code: `
            async function main(ctx) {
              let baseUrl = (ctx.$env('BASE_URL') || '');
              while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
              if (!baseUrl) throw new Error('baseUrl is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const qs = new URLSearchParams();
              qs.set('topic', 'node-schema');
              const nodeType = ctx.$input?.nodeType || 'all';
              qs.set('nodeType', nodeType);
              const url = baseUrl + '/docs?' + qs.toString();
              const headers = authToken ? { 'Authorization': 'Bearer ' + authToken } : {};
              return { url, headers };
            }`,
          timeout: 3000,
        },
      },
      {
        ref: 'http_1',
        type: 'http_request',
        name: 'Fetch Node Schema',
        description: 'GET /api/v1/docs?topic=node-schema&... (public)',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: 'GET',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("http_1")[0].json.body.data }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_1' },
      { ref: 'e3', from: 'http_1', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: docs-node-schema
 */
export const nodeSchemaIntrospectionToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: nodeSchemaIntrospectionTool.name,
  description: nodeSchemaIntrospectionTool.description,
  parameters: nodeSchemaIntrospectionTool.parameters,
  blueprint: nodeSchemaIntrospectionTool.blueprint,

  slug: 'docs-node-schema',
  category: 'automation',
  exampleUsage: '{ "nodeType": "llm" } // returns LLM node markdown',
  requiresApiKey: false,
  configurationFields: [],
};
