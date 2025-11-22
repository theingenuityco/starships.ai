import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Agent
 * Edit the currently focused agent with partial updates. Designed for incremental agent development.
 */
export const agentEditTool: ToolParams = {
  name: 'Edit Agent',
  slug: 'edit-agent',
  description: `Updates an existing agent by slug with partial changes. Designed for incremental agent development and refinement.

## Purpose
Apply partial updates to any agent by providing its slug. Supports updating individual fields without needing to provide complete agent data.

## Required Parameters
- **slug**: Agent slug to update (kebab-case identifier)

## Optional Parameters
- **name**: Update agent name
- **description**: Update agent description
- **model**: Update LLM model
- **systemPrompt**: Update system instructions. Must begin with <character name="AGENT_NAME">ROLE</character> as the first line and preserve this header unless explicitly changing name/role.
- **temperature**: Update temperature (0-2)
- **maxTokens**: Update max tokens
- **blueprint**: Update Autopilot blueprint
- **timeout**: Update execution timeout
- **previewPrompts**: Update preview/example prompts (max 10)

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Updated agent model
- **Workflow**: 1) Resolve agent by slug, 2) Apply partial updates, 3) Return updated agent
- **Timeouts**: Preparation (3s), Fetch (5s), Update (10s)
- **Common failures**: Missing slug, agent not found (404 error), validation errors`,
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
        type: 'http_request',
        name: 'Fetch Agent by Slug',
        description: 'GET /starships/:starshipId/agents/:slug to resolve agent ID',
        parameters: {
          url: '{{ "/starships/" + env("STARSHIP_ID") + "/agents/" + (lastOutputOf("prepare") || {}).slug }}',
          method: 'GET',
          connector: 'starships',
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
                body: prep.body
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'http_request',
        name: 'Update Agent',
        description: 'PUT /agents/:id with partial updates',
        parameters: {
          url: '{{ "/agents/" + (lastOutputOf("prepare_update") || {}).agentId }}',
          method: 'PUT',
          body: '{{ (lastOutputOf("prepare_update") || {}).body }}',
          connector: 'starships',
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
  version: '1.0.2',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent", "systemPrompt": "Updated instructions", "previewPrompts": ["New example 1", "New example 2"] } // partial updates by slug',
  requiresApiKey: false,
  configurationFields: [],
};
