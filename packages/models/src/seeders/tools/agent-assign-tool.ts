import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Assign Tool to Agent
 * Add a tool to an agent's assignedToolSlugs array
 */
export const agentAssignToolTool: ToolParams = {
  name: 'Assign Agent Tool',
  slug: 'agent-assign-tool',
  description: `Assign a tool to an agent by adding it to the agent's assignedToolSlugs array.

## Purpose
Grant an agent access to a specific tool by its slug. The tool must exist on the starship before assignment.

## Required Parameters
- **agentSlug**: Agent slug to update
- **toolSlug**: Tool slug to assign

## Behavior
1. Fetches current agent by slug
2. Checks if tool is already assigned (idempotent - won't duplicate)
3. Adds toolSlug to assignedToolSlugs array if not present
4. Updates agent with new tool assignment
5. Returns updated agent model

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response
Returns updated agent with tool added to assignedToolSlugs array.

## Common Failures
- Agent not found (404)
- Tool does not exist (validation error)
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
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            if (!input.agentSlug) throw new Error('agentSlug is required');
            if (!input.toolSlug) throw new Error('toolSlug is required');

            return {
              baseUrl,
              starshipId,
              agentSlug: input.agentSlug,
              toolSlug: input.toolSlug,
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              }
            };
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
          url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/agents/" + $lastOutputOf("prepare")[0].json.agentSlug }}',
          method: 'GET',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'update_tools',
        type: 'code',
        name: 'Update Tool Assignment',
        description: 'Add tool to assignedToolSlugs if not already present',
        parameters: {
          code: `
            const fetchResponse = $lastOutputOf('fetch_agent')[0]?.json ?? {};
            const agentData = fetchResponse.body?.data || fetchResponse.body;

            if (!agentData || !agentData.id) {
              throw new Error('Failed to fetch agent');
            }

            const ctx = $lastOutputOf('prepare')[0].json;
            const toolSlug = ctx.toolSlug;

            // Get current assignedToolSlugs or initialize empty array
            let assignedToolSlugs = agentData.assignedToolSlugs || [];
            if (!Array.isArray(assignedToolSlugs)) {
              assignedToolSlugs = [];
            }

            // Add tool if not already present (idempotent)
            if (!assignedToolSlugs.includes(toolSlug)) {
              assignedToolSlugs.push(toolSlug);
            }

            return {
              url: \`\${ctx.baseUrl}/agents/\${agentData.id}\`,
              method: 'PUT',
              headers: ctx.headers,
              body: {
                assignedToolSlugs
              },
              toolAdded: !assignedToolSlugs.includes(toolSlug)
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_update',
        type: 'http_request',
        name: 'Update Agent',
        description: 'PUT /agents/:id with updated assignedToolSlugs',
        parameters: {
          url: '{{ $lastOutputOf("update_tools")[0].json.url }}',
          method: '{{ $lastOutputOf("update_tools")[0].json.method }}',
          headers: '{{ $lastOutputOf("update_tools")[0].json.headers }}',
          body: '{{ $lastOutputOf("update_tools")[0].json.body }}',
          timeout: 10000,
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
 * Tool Template: agent-assign-tool
 */
export const agentAssignToolToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentAssignToolTool.name,
  description: agentAssignToolTool.description,
  parameters: agentAssignToolTool.parameters,
  blueprint: agentAssignToolTool.blueprint,

  slug: 'agent-assign-tool',
  category: 'automation',
  exampleUsage: '{ "agentSlug": "support-agent", "toolSlug": "wikipedia" } // assign wikipedia tool to support agent',
  requiresApiKey: false,
  configurationFields: [],
};
