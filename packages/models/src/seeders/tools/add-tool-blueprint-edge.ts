import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Add Tool Blueprint Edge
 * Adds a new edge to an existing tool's blueprint with validation
 */
export const toolAddBlueprintEdgeTool: ToolParams = {
  name: 'Add Tool Blueprint Edge',
  slug: 'add-tool-blueprint-edge',
  description: `Adds a new edge to an existing tool's blueprint with automatic validation and conflict detection.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **edge**: New edge to add with ref, from, to, optional condition/label/metadata
`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
      },
      edge: {
        type: 'object',
        description: 'Edge to add to tool blueprint',
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
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('BASE_URL is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const starshipId = ctx.$env('STARSHIP_ID');
              if (!authToken) throw new Error('AUTH_TOKEN is required');
              if (!starshipId) throw new Error('STARSHIP_ID is required');
              if (!ctx.$input.toolSlug) throw new Error('toolSlug is required');
              if (!ctx.$input.edge || typeof ctx.$input.edge !== 'object') throw new Error('edge is required and must be an object');
              return {
                baseUrl,
                starshipId,
                toolSlug: ctx.$input.toolSlug,
                edge: ctx.$input.edge,
                headers: {
                  'Authorization': \`Bearer \${authToken}\`,
                  'Content-Type': 'application/json'
                }
              };
            }
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
        ref: 'validate_edge',
        type: 'code',
        name: 'Validate and Add Edge',
        description: 'Validate edge and add to blueprint',
        parameters: {
          code: `
            async function main(ctx) {
              const fetchResponse = ctx.$lastOutputOf('fetch_tool')[0]?.json ?? {};
              const toolData = fetchResponse.body?.data || fetchResponse.body;
              if (!toolData || !toolData.blueprint) throw new Error('Tool not found or missing blueprint');
              const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
              if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
              if (!Array.isArray(blueprint.edges)) blueprint.edges = [];
              const edge = ctx.$lastOutputOf('prepare')[0].json.edge;
              const errors = [];
              if (!edge.ref || typeof edge.ref !== 'string') errors.push('Edge must have a valid ref (string)');
              if (!edge.from || typeof edge.from !== 'string') errors.push('Edge must have a valid from (string)');
              if (!edge.to || typeof edge.to !== 'string') errors.push('Edge must have a valid to (string)');
              const nodeRefs = new Set(blueprint.nodes.map((n) => n?.ref).filter(Boolean));
              if (edge.from && !nodeRefs.has(edge.from)) errors.push(\`Unknown from node: \${edge.from}\`);
              if (edge.to && !nodeRefs.has(edge.to)) errors.push(\`Unknown to node: \${edge.to}\`);
              const existingRefs = new Set(blueprint.edges.map((e) => e?.ref).filter(Boolean));
              if (existingRefs.has(edge.ref)) errors.push(\`Edge ref already exists: \${edge.ref}\`);
              if (errors.length > 0) return { success: false, errors, toolData };
              blueprint.edges.push({ ref: edge.ref, from: edge.from, to: edge.to, ...(edge.condition ? { condition: edge.condition } : {}), ...(edge.label ? { label: edge.label } : {}), ...(edge.metadata ? { metadata: edge.metadata } : {}) });
              return { success: true, toolData, updatedBlueprint: blueprint, addedEdge: edge, edgeCount: blueprint.edges.length };
            }
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
          url: '{{ $lastOutputOf("validate_edge")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate_edge")[0].json.toolData.id : "" }}',
          method: 'PUT',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ (() => { const result = $lastOutputOf("validate_edge")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}',
          timeout: 10000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: 'Return updated tool or validation errors', parameters: { output: '{{ $lastOutputOf("update_tool")[0].json }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'validate_edge' },
      { ref: 'e4', from: 'validate_edge', to: 'update_tool' },
      { ref: 'e5', from: 'update_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

export const toolAddBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolAddBlueprintEdgeTool.name,
  description: toolAddBlueprintEdgeTool.description,
  parameters: toolAddBlueprintEdgeTool.parameters,
  blueprint: toolAddBlueprintEdgeTool.blueprint,

  slug: 'add-tool-blueprint-edge',
  version: '1.0.1',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "edge": { "ref": "edge_process", "from": "start", "to": "process" } }',
  requiresApiKey: false,
  configurationFields: [],
};


