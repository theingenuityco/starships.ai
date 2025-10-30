import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Remove Tool Blueprint Edge
 * Removes an edge from a blueprint
 */
export const blueprintRemoveEdgeTool: ToolParams = {
  name: 'Remove Tool Blueprint Edge',
  slug: 'remove-tool-blueprint-edge',
  description: `Removes an edge from a tool's blueprint while maintaining node integrity.`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: { type: 'string', description: 'Slug of the tool to modify' },
      edgeRef: { type: 'string', description: 'Reference of the edge to remove' },
    },
    required: ['toolSlug', 'edgeRef'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'prepare', type: 'code', name: 'Prepare Request', description: 'Build URL, headers and validate inputs', parameters: { code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');
            if (!input.toolSlug) throw new Error('toolSlug is required');
            if (!input.edgeRef || typeof input.edgeRef !== 'string') throw new Error('edgeRef is required and must be a string');
            return { baseUrl, starshipId, toolSlug: input.toolSlug, edgeRef: input.edgeRef, headers: { 'Authorization': \`Bearer \${authToken}\`, 'Content-Type': 'application/json' } };
          `, timeout: 3000 } },
      { ref: 'fetch_tool', type: 'http_request', name: 'Fetch Current Tool', description: 'GET /starships/:starshipId/tools/:toolSlug', parameters: { url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/tools/" + $lastOutputOf("prepare")[0].json.toolSlug }}', method: 'GET', headers: '{{ $lastOutputOf("prepare")[0].json.headers }}', timeout: 5000 } },
      { ref: 'validate', type: 'code', name: 'Validate and Remove Edge', description: 'Remove edge from blueprint', parameters: { code: `
            const fetchResponse = $lastOutputOf('fetch_tool')[0]?.json ?? {};
            const toolData = fetchResponse.body?.data || fetchResponse.body;
            if (!toolData || !toolData.blueprint) throw new Error('Tool not found or missing blueprint');
            const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];
            const edgeRef = $lastOutputOf('prepare')[0].json.edgeRef;
            const edgeIndex = blueprint.edges.findIndex(e => e?.ref === edgeRef);
            if (edgeIndex === -1) return { success: false, error: \`Edge not found: \${edgeRef}\`, toolData };
            const removedEdge = blueprint.edges[edgeIndex];
            blueprint.edges.splice(edgeIndex, 1);
            return { success: true, toolData, updatedBlueprint: blueprint, removedEdge, edgeRef, remainingEdges: blueprint.edges.length };
          `, timeout: 3000 } },
      { ref: 'update_tool', type: 'http_request', name: 'Update Tool with Modified Blueprint', description: 'PUT /tools/:id with updated blueprint', parameters: { url: '{{ $lastOutputOf("validate")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate")[0].json.toolData.id : "" }}', method: 'PUT', headers: '{{ $lastOutputOf("prepare")[0].json.headers }}', body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}', timeout: 10000 } },
      { ref: 'end_1', type: 'end', name: 'End', description: 'Return updated tool or validation errors', parameters: { output: '{{ $lastOutputOf("update_tool")[0].json }}' } },
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

export const toolRemoveBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintRemoveEdgeTool.name,
  description: blueprintRemoveEdgeTool.description,
  parameters: blueprintRemoveEdgeTool.parameters,
  blueprint: blueprintRemoveEdgeTool.blueprint,

  slug: 'remove-tool-blueprint-edge',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "edgeRef": "old_edge" }',
  requiresApiKey: false,
  configurationFields: [],
};


