import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Unassign Tool from Agent
 * Remove a tool from an agent's assignedToolSlugs array
 */
export const agentUnassignToolTool: ToolParams = {
  name: 'Unassign Agent Tool',
  slug: 'unassign-agent-tool',
  description:
    'Unassign a tool from an agent by slug on the current starship (deletes the Agent→Tool relationship). Returns the updated agent or server response.',
  parameters: {
    type: 'object',
    properties: {
      agentSlug: {
        type: 'string',
        description: 'Agent slug to update',
      },
      toolSlug: {
        type: 'string',
        description: 'Tool slug to remove from the agent',
      },
    },
    required: ['agentSlug', 'toolSlug'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Validate inputs and prepare context',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              if (!input.agentSlug) throw new Error('agentSlug is required');
              if (!input.toolSlug) throw new Error('toolSlug is required');

              return {
                agentSlug: input.agentSlug,
                toolSlug: input.toolSlug
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_agent',
        type: 'connector_action',
        name: 'Fetch Agent',
        description: 'GET /starships/:starshipId/agents/:slug',
        parameters: {
          connector: 'starships',
          action: 'get-agent',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).agentSlug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'update_tools',
        type: 'code',
        name: 'Remove Tool Relationship',
        description: 'DELETE /agents/:id/tools/:toolSlug?starshipId=...',
        parameters: {
          code: `
            async function main(ctx) {
              const fetchResponse = ctx.lastOutputOf('fetch_agent') || {};
              const agentData = fetchResponse.body?.data || fetchResponse.body;

              if (!agentData || !agentData.id) {
                throw new Error('Failed to fetch agent');
              }

              const prep = ctx.lastOutputOf('prepare') || {};
              const toolSlug = prep.toolSlug;

              return {
                agentId: String(agentData.id),
                toolSlug: String(toolSlug),
                timeout: 10000
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'connector_action',
        name: 'Unassign Tool',
        description: 'DELETE /agents/:id/tools/:toolSlug',
        parameters: {
          connector: 'starships',
          action: 'unassign-agent-tool',
          args: {
            agentId: '{{ (lastOutputOf("update_tools") || {}).agentId }}',
            toolSlug: '{{ (lastOutputOf("update_tools") || {}).toolSlug }}',
          },
          timeout: '{{ (lastOutputOf("update_tools") || {}).timeout }}',
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
      { ref: 'e3', from: 'fetch_agent', to: 'update_tools' },
      { ref: 'e4', from: 'update_tools', to: 'http_update' },
      { ref: 'e5', from: 'http_update', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: unassign-agent-tool
 */
export const agentUnassignToolToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentUnassignToolTool.name,
  description: agentUnassignToolTool.description,
  parameters: agentUnassignToolTool.parameters,
  blueprint: agentUnassignToolTool.blueprint,

  slug: 'unassign-agent-tool',
  version: '1.0.2',
  category: 'automation',
  exampleUsage: '{ "agentSlug": "support-agent", "toolSlug": "wikipedia" } // remove wikipedia tool from support agent',
  requiresApiKey: false,
  configurationFields: [],
};
