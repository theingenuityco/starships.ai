import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Unassign Tool from Agent
 * Remove a tool from an agent's assignedToolSlugs array
 */
export const agentUnassignToolTool: ToolParams = {
  name: 'Unassign Agent Tool',
  slug: 'unassign-agent-tool',
  description: `Remove a tool from an agent by deleting the Agent→Tool relationship.

## Purpose
Revoke an agent's access to a specific tool by its slug.

## Required Parameters
- **agentSlug**: Agent slug to update
- **toolSlug**: Tool slug to remove

## Behavior
1. Fetches current agent by slug
2. Calls DELETE /agents/:id/tools/:toolSlug?starshipId=... to remove relationship
3. Returns server response

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response
Returns server response.

## Common Failures
- Agent not found (404)
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
              if (!ctx.$input.agentSlug) throw new Error('agentSlug is required');
              if (!ctx.$input.toolSlug) throw new Error('toolSlug is required');

              return {
                agentSlug: ctx.$input.agentSlug,
                toolSlug: ctx.$input.toolSlug
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
          url: '{{ "/starships/self/agents/" + $lastOutputOf("prepare")[0].json.agentSlug }}',
          method: 'GET',
          connectorSlug: 'starships',
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
              const fetchResponse = ctx.$lastOutputOf('fetch_agent')[0]?.json ?? {};
              const agentData = fetchResponse.body?.data || fetchResponse.body;

              if (!agentData || !agentData.id) {
                throw new Error('Failed to fetch agent');
              }

              const prep = ctx.$lastOutputOf('prepare')[0].json;
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
        type: 'http_request',
        name: 'Unassign Tool',
        description: 'DELETE /agents/:id/tools/:toolSlug',
        parameters: {
          url: '{{ "/agents/" + $lastOutputOf("update_tools")[0].json.agentId + "/tools/" + $lastOutputOf("update_tools")[0].json.toolSlug }}',
          method: 'DELETE',
          connectorSlug: 'starships',
          timeout: '{{ $lastOutputOf("update_tools")[0].json.timeout }}',
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated agent',
        parameters: {
          output: '{{ $lastOutputOf("http_update")[0].json }}',
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
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{ "agentSlug": "support-agent", "toolSlug": "wikipedia" } // remove wikipedia tool from support agent',
  requiresApiKey: false,
  configurationFields: [],
};
