import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Blueprint Examples
 * Provides comprehensive blueprint examples for various use cases
 */
export const blueprintExamplesTool: ToolParams = {
  name: 'Docs Blueprint Examples',
  slug: 'docs-blueprint-examples',
  description: `Query a library of working blueprint examples for different scenarios and patterns.

## Purpose
Provides real-world, tested blueprint examples showing proper structure, node usage, error handling, and advanced patterns.

## Example Categories
- **basic**: Simple linear workflows
- **conditional**: Branching and decision logic
- **loops**: Tool calling loops and iterations
- **api_integration**: HTTP requests and API workflows
- **llm_patterns**: LLM usage patterns with tools
- **error_handling**: Resilient workflows with error recovery
- **state_management**: Complex state transformations
- **nested**: Workflows with nested blueprints

## Response Format
Returns complete, executable blueprints with:
- Detailed node configurations
- Proper edge connections
- Template expression examples
- Comments explaining the pattern`,
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['basic', 'conditional', 'loops', 'api_integration', 'llm_patterns', 'error_handling', 'state_management', 'nested', 'all'],
        description: 'Category of examples to retrieve',
      },
      pattern: {
        type: 'string',
        description: 'Specific pattern name within category (optional)',
      },
    },
    required: ['category'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL and headers for /api/v1/docs (blueprint-examples)',
        parameters: {
          code: `
            async function main(ctx) {
              let baseUrl = (ctx.$env('BASE_URL') || '');
              while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
              if (!baseUrl) throw new Error('baseUrl is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const qs = new URLSearchParams();
              qs.set('topic', 'blueprint-examples');
              const category = ctx.$input?.category || 'all';
              qs.set('category', category);
              const pattern = ctx.$input?.pattern;
              if (pattern) qs.set('pattern', pattern);
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
        name: 'Fetch Examples',
        description: 'GET /api/v1/docs?topic=blueprint-examples&... (public)',
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

export const blueprintExamplesToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintExamplesTool.name,
  description: blueprintExamplesTool.description,
  parameters: blueprintExamplesTool.parameters,
  blueprint: blueprintExamplesTool.blueprint,

  slug: 'docs-blueprint-examples',
  category: 'automation',
  exampleUsage: '{ "category": "llm_patterns" } // returns all LLM pattern examples',
  requiresApiKey: false,
  configurationFields: [],
};
