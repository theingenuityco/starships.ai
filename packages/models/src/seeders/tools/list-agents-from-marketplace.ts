import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: list-agents-from-marketplace
 * List all agent templates available in the marketplace
 */
export const agentTemplateListTool: ToolParams = {
  name: 'List Agents From Marketplace',
  slug: 'list-agents-from-marketplace',
  description:
    'Search and list agent templates available in the marketplace for discovery and deployment. Supports search by name, description, or capabilities. Returns a lean array (id, slug, name, description, category, role) without heavy fields like systemPrompt or blueprint.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to filter agents by name, description, or capabilities (e.g., "customer support", "coding", "research")',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default: 1)',
      },
      limit: {
        type: 'number',
        description: 'Number of results per page (default: 50)',
      },
    },
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Prepare search and pagination parameters',
        parameters: {
          code: `
            async function main(ctx) {
              const query = ctx.input?.query || '';
              const page = ctx.input?.page || 1;
              const limit = ctx.input?.limit || 50;
              
              return {
                query: query.trim(),
                page,
                limit,
                ok: true
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_list',
        type: 'connector_action',
        name: 'Search Agent Templates',
        description: 'GET /agent-templates with optional search query',
        parameters: {
          connector: 'starships',
          action: 'list-agents-from-marketplace',
          failOnNon2xx: true,
          args: {
            query: '{{ lastOutputOf("prepare").query }}',
            page: '{{ lastOutputOf("prepare").page }}',
            limit: '{{ lastOutputOf("prepare").limit }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'summarize',
        type: 'code',
        name: 'Summarize Templates',
        description: 'Extract and format agent template data',
        parameters: {
          code: `
            async function main(ctx) {
              // Input is the HttpResponse from http_list (see HttpRequest node contract)
              const http = ctx.input;
              const body = http && typeof http === 'object' ? http.body : http;
              // Server sendSuccess returns { data: T }, so prefer body.data when present
              const data = body && typeof body === 'object' && Array.isArray(body.data)
                ? body.data
                : (Array.isArray(body) ? body : []);

              // Return a lean summary with public fields only
              return data.map((template) => ({
                slug: template && template.slug,
                name: template && template.name,
                description: template && template.description,
                category: template && template.category,
                role: template && template.role,
                version: template && template.version,
                previewPrompts: template && template.previewPrompts,
              }));
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("summarize") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_list' },
      { ref: 'e3', from: 'http_list', to: 'summarize' },
      { ref: 'e4', from: 'summarize', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const agentTemplateListToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentTemplateListTool.name,
  description: agentTemplateListTool.description,
  parameters: agentTemplateListTool.parameters,
  blueprint: agentTemplateListTool.blueprint,

  slug: 'list-agents-from-marketplace',
  version: '1.0.0',
  category: 'automation',
  exampleUsage: '{ "query": "customer support", "page": 1, "limit": 50 } // searches and returns matching agent templates from the marketplace',
  requiresApiKey: false,
  configurationFields: [],
};
