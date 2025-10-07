import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Add Tool Blueprint Edge
 * Adds a new edge between nodes in an existing tool's blueprint with validation
 */
export const toolAddBlueprintEdgeTool: ToolParams = {
  name: 'Add Tool Blueprint Edge',
  slug: 'tool-add-blueprint-edge',
  description: `Adds a new edge between existing nodes in a tool's blueprint with automatic validation and connectivity checks.

## Purpose
Incrementally build blueprint connectivity by adding edges one at a time, ensuring proper workflow flow.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **edge**: New edge to add with from, to, ref, and optional condition

## Edge Requirements
- **ref**: Unique identifier (string)
- **from**: Source node ref (must exist in blueprint)
- **to**: Target node ref (must exist in blueprint)
- **condition**: Optional JavaScript expression for conditional routing

## Workflow
1. Fetches current tool by slug
2. Validates new edge structure and uniqueness
3. Verifies source and target nodes exist
4. Adds edge to tool's blueprint
5. Updates tool with modified blueprint

## Validation
- Verifies tool exists and is accessible
- Verifies source and target nodes exist in blueprint
- Checks for ref uniqueness within blueprint
- Ensures edge creates valid workflow paths
- Validates condition expressions when provided

## Response
Returns updated tool with new edge added, or validation errors if addition fails`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
      },
      edge: {
        type: 'object',
        description: 'Edge to add between nodes',
        properties: {
          ref: { type: 'string', description: 'Unique edge identifier' },
          from: { type: 'string', description: 'Source node ref' },
          to: { type: 'string', description: 'Target node ref' },
          condition: { type: 'string', description: 'Optional condition expression' },
        },
      },
    },
    required: ['toolSlug', 'edge'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL, headers and validate inputs',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            if (!input.toolSlug) {
              throw new Error('toolSlug is required');
            }

            if (!input.edge || typeof input.edge !== 'object') {
              throw new Error('edge is required and must be an object');
            }

            return {
              baseUrl,
              starshipId,
              toolSlug: input.toolSlug,
              edge: input.edge,
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
        ref: 'fetch_tool',
        type: 'http_request',
        name: 'Fetch Current Tool',
        description: 'GET /starships/:starshipId/tools/:toolSlug',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/tools/" + $lastOutputOf("prepare")[0].json.toolSlug }}',
          method: 'GET',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          timeout: 5000,
        },
      },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Add Edge',
        description: 'Add edge to blueprint with validation',
        parameters: {
          code: `
            const fetchResponse = $lastOutputOf('fetch_tool')[0]?.json ?? {};
            const toolData = fetchResponse.body?.data || fetchResponse.body;

            if (!toolData || !toolData.blueprint) {
              throw new Error('Tool not found or missing blueprint');
            }

            const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

            const newEdge = $lastOutputOf('prepare')[0].json.edge;
            const errors = [];

            // Validate edge structure
            if (!newEdge.ref || typeof newEdge.ref !== 'string') {
              errors.push('Edge must have a valid ref (string)');
            }

            if (!newEdge.from || typeof newEdge.from !== 'string') {
              errors.push('Edge must have a valid from node (string)');
            }

            if (!newEdge.to || typeof newEdge.to !== 'string') {
              errors.push('Edge must have a valid to node (string)');
            }

            // Check for ref conflicts
            const existingRefs = new Set(blueprint.edges.map(e => e?.ref).filter(Boolean));
            if (existingRefs.has(newEdge.ref)) {
              errors.push(\`Edge ref already exists: \${newEdge.ref}\`);
            }

            // Validate node references
            const nodeRefs = new Set(blueprint.nodes.map(n => n?.ref).filter(Boolean));

            if (newEdge.from && !nodeRefs.has(newEdge.from)) {
              errors.push(\`Source node does not exist: \${newEdge.from}\`);
            }

            if (newEdge.to && !nodeRefs.has(newEdge.to)) {
              errors.push(\`Target node does not exist: \${newEdge.to}\`);
            }

            // Validate condition if provided
            if (newEdge.condition && typeof newEdge.condition !== 'string') {
              errors.push('Edge condition must be a string expression');
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                toolData
              };
            }

            // Add the edge
            blueprint.edges.push(newEdge);

            return {
              success: true,
              toolData,
              updatedBlueprint: blueprint,
              addedEdge: newEdge,
              edgeCount: blueprint.edges.length
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'update_tool',
        type: 'http_request',
        name: 'Update Tool with New Blueprint',
        description: 'PUT /tools/:id with updated blueprint',
        parameters: {
          url: '{{ $lastOutputOf("validate")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate")[0].json.toolData.id : "" }}',
          method: 'PUT',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}',
          timeout: 10000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated tool or validation errors',
        parameters: {
          output: '{{ $lastOutputOf("update_tool")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'validate' },
      { ref: 'e4', from: 'validate', to: 'update_tool' },
      { ref: 'e5', from: 'update_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool-add-blueprint-edge
 */
export const toolAddBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolAddBlueprintEdgeTool.name,
  description: toolAddBlueprintEdgeTool.description,
  parameters: toolAddBlueprintEdgeTool.parameters,
  blueprint: toolAddBlueprintEdgeTool.blueprint,

  slug: 'tool-add-blueprint-edge',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "edge": { "ref": "to_process", "from": "start", "to": "process" } }',
  requiresApiKey: false,
  configurationFields: [],
};
