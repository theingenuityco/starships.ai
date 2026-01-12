import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Agent
 * Edit the currently focused agent with partial updates. Designed for incremental agent development.
 */
export const agentEditTool: ToolParams = {
  name: 'Edit Agent',
  slug: 'edit-agent',
  description:
    'Update an existing agent by slug with partial fields (name, role, description, model, systemPrompt, temperature, maxTokens, blueprint, timeout, previewPrompts). Returns the updated agent model.',
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Agent slug to update (kebab-case)',
      },
      name: {
        type: 'string',
        description: 'New agent name',
      },
      role: {
        type: 'string',
        description:
          'New agent role (separate field from systemPrompt). If you change role, consider updating the systemPrompt identity/header to match.',
      },
      description: {
        type: 'string',
        description: 'New agent description',
      },
      model: {
        type: 'string',
        description: 'New LLM model',
      },
      systemPrompt: {
        type: 'string',
        description:
          'New system instructions. Must begin with <character name="AGENT_NAME">ROLE</character> as the first line and preserve this header unless explicitly changing name/role.',
      },
      temperature: {
        type: 'number',
        description: 'New temperature (0-2)',
      },
      maxTokens: {
        type: 'number',
        description: 'New max tokens',
      },
      blueprint: {
        type: 'object',
        description: 'New Autopilot blueprint { nodes, edges }',
      },
      timeout: {
        type: 'number',
        description: 'New execution timeout in ms',
      },
      previewPrompts: {
        type: 'array',
        items: { type: 'string' },
        description: 'New preview/example prompts (max 10)',
      },
    },
    required: ['slug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Build URL, headers and partial body for agent update',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              if (!input.slug) {
                throw new Error('slug is required');
              }

              // Build partial update body with only provided fields
              const body = {};
              if (input.name !== undefined) body.name = input.name;
              if (input.role !== undefined) body.role = input.role;
              if (input.description !== undefined) body.description = input.description;
              if (input.model !== undefined) body.model = input.model;
              if (input.systemPrompt !== undefined) body.systemPrompt = input.systemPrompt;
              if (input.temperature !== undefined) body.temperature = input.temperature;
              if (input.maxTokens !== undefined) body.maxTokens = input.maxTokens;
              if (input.blueprint !== undefined) body.blueprint = input.blueprint;
              if (input.timeout !== undefined) body.timeout = input.timeout;
              if (Array.isArray(input.previewPrompts)) {
                const prompts = input.previewPrompts.filter(p => typeof p === 'string' && p.trim()).slice(0, 10);
                body.previewPrompts = prompts;
              }

              if (Object.keys(body).length === 0) {
                throw new Error('At least one field must be provided for update');
              }

              return {
                slug: input.slug,
                body: body
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_agent',
        type: 'connector_action',
        name: 'Fetch Agent by Slug',
        description: 'GET /starships/:starshipId/agents/:slug to resolve agent ID',
        parameters: {
          connector: 'starships',
          action: 'get-agent',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).slug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'prepare_update',
        type: 'code',
        name: 'Prepare Update Request',
        description: 'Extract agent ID and prepare PUT request',
        parameters: {
          code: `
            async function main(ctx) {
              const fetchResponse = ctx.lastOutputOf('fetch_agent') || {};
              const agentData = fetchResponse.body?.data || fetchResponse.body;

              if (!agentData || !agentData.id) {
                throw new Error('Failed to resolve agent by slug');
              }

              const prep = ctx.lastOutputOf('prepare') || {};

              return {
                agentId: String(agentData.id),
                ...(prep.body || {})
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'connector_action',
        name: 'Update Agent',
        description: 'PUT /agents/:id with partial updates',
        parameters: {
          connector: 'starships',
          action: 'update-agent',
          args: '{{ lastOutputOf("prepare_update") }}',
          timeout: 10000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated agent',
        parameters: {
          output: '{{ lastOutputOf("http_update") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_agent' },
      { ref: 'e3', from: 'fetch_agent', to: 'prepare_update' },
      { ref: 'e4', from: 'prepare_update', to: 'http_update' },
      { ref: 'e5', from: 'http_update', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: edit-agent
 */
export const agentEditToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentEditTool.name,
  description: agentEditTool.description,
  parameters: agentEditTool.parameters,
  blueprint: agentEditTool.blueprint,

  slug: 'edit-agent',
  version: '1.0.3',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent", "role": "Customer Support Specialist", "systemPrompt": "Updated instructions", "previewPrompts": ["New example 1", "New example 2"] } // partial updates by slug',
  requiresApiKey: false,
  configurationFields: [],
};
