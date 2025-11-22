import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Assign Tool to Agent
 * Add a tool to an agent's assignedToolSlugs array
 */
export const agentAssignToolTool: ToolParams = {
  name: 'Assign Agent Tool',
  slug: 'assign-agent-tool',
  description: `Assign a tool to an agent by creating an Agent→Tool relationship.

## Purpose
Grant an agent access to a specific tool by its slug. The tool must exist on the starship before assignment.

## Required Parameters
- **agentSlug**: Agent slug to update
- **toolSlug**: Tool slug to assign

## Behavior
1. Fetches current agent by slug
2. Calls POST /agents/:id/tools/:toolSlug with { starshipId } to create relationship
3. Returns server response

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **STARSHIP_ID**: Current starship identifier

## Response
Returns server response indicating success.

## Common Failures
- Agent or Tool not found (404)
- Missing environment variables
- Invalid slugs`,
  parameters: {
    type: 'object',
    properties: {
      agentSlug: {
        type: 'string',
        description: 'Agent slug to update',
      },
      toolSlug: {
        type: 'string',
        description: 'Tool slug to assign to the agent',
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
        type: 'http_request',
        name: 'Fetch Agent',
        description: 'GET /starships/:starshipId/agents/:slug',
        parameters: {
          url: '{{ "/starships/" + env("STARSHIP_ID") + "/agents/" + (lastOutputOf("prepare") || {}).agentSlug }}',
          method: 'GET',
          connector: 'starships',
          timeout: 5000,
        },
      },
      {
        ref: 'update_tools',
        type: 'code',
        name: 'Create Tool Relationship',
        description: 'Prepare POST /agents/:id/tools/:toolSlug with starshipId',
        parameters: {
          code: `
            async function main(ctx) {
              const fetchResponse = ctx.lastOutputOf('fetch_agent') || {};
              const agentData = fetchResponse.body && typeof fetchResponse.body === 'object'
                ? (fetchResponse.body.data || fetchResponse.body)
                : fetchResponse.data || fetchResponse;

              if (!agentData || !agentData.id) {
                throw new Error('Failed to fetch agent');
              }

              const prep = ctx.lastOutputOf('prepare') || {};
              const toolSlug = prep.toolSlug;
              const starshipId = ctx.env && ctx.env('STARSHIP_ID');
              if (!starshipId) {
                throw new Error('STARSHIP_ID missing');
              }

              return {
                agentId: String(agentData.id),
                toolSlug: String(toolSlug),
                starshipId: String(starshipId),
                timeout: 10000
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'http_request',
        name: 'Assign Tool',
        description: 'POST /agents/:id/tools/:toolSlug',
        parameters: {
          url: '{{ "/agents/" + (lastOutputOf("update_tools") || {}).agentId + "/tools/" + (lastOutputOf("update_tools") || {}).toolSlug }}',
          method: 'POST',
          connector: 'starships',
          body: {
            starshipId: '{{ env("STARSHIP_ID") }}',
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
 * Tool Template: assign-agent-tool
 */
export const agentAssignToolToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentAssignToolTool.name,
  description: agentAssignToolTool.description,
  parameters: agentAssignToolTool.parameters,
  blueprint: agentAssignToolTool.blueprint,

  slug: 'assign-agent-tool',
  version: '1.0.2',
  category: 'automation',
  exampleUsage: '{ "agentSlug": "support-agent", "toolSlug": "wikipedia" } // assign wikipedia tool to support agent',
  requiresApiKey: false,
  configurationFields: [],
};
