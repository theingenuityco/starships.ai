import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Tool Blueprint Edge
 * Modifies properties of an existing edge in a blueprint
 */
export const blueprintEditEdgeTool: ToolParams = {
  name: 'Edit Tool Blueprint Edge',
  slug: 'edit-tool-blueprint-edge',
  description: `Modifies properties of an existing edge in a tool's blueprint, including conditions and connections.`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: { type: 'string', description: 'Slug of the tool to modify' },
      edgeRef: { type: 'string', description: 'Reference of the edge to edit' },
      updates: { type: 'object', description: 'Properties to update on the edge' },
    },
    required: ['toolSlug', 'edgeRef', 'updates'],
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
            if (!input.updates || typeof input.updates !== 'object') throw new Error('updates is required and must be an object');
            return { baseUrl, starshipId, toolSlug: input.toolSlug, edgeRef: input.edgeRef, updates: input.updates, headers: { 'Authorization': \`Bearer ${authToken}\`, 'Content-Type': 'application/json' } };
          `, timeout: 3000 } },
      { ref: 'fetch_tool', type: 'http_request', name: 'Fetch Current Tool', description: 'GET /starships/:starshipId/tools/:toolSlug', parameters: { url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/tools/" + $lastOutputOf("prepare")[0].json.toolSlug }}', method: 'GET', headers: '{{ $lastOutputOf("prepare")[0].json.headers }}', timeout: 5000 } },
      { ref: 'validate', type: 'code', name: 'Validate and Edit Edge', description: 'Edit edge properties with validation', parameters: { code: `
            const fetchResponse = $lastOutputOf('fetch_tool')[0]?.json ?? {};
            const toolData = fetchResponse.body?.data || fetchResponse.body;
            if (!toolData || !toolData.blueprint) throw new Error('Tool not found or missing blueprint');
            const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];
            const edgeRef = $lastOutputOf('prepare')[0].json.edgeRef;
            const updates = $lastOutputOf('prepare')[0].json.updates;
            const edgeIndex = blueprint.edges.findIndex(e => e?.ref === edgeRef);
            if (edgeIndex === -1) return { success: false, error: \`Edge not found: \${edgeRef}\`, toolData };
            const currentEdge = blueprint.edges[edgeIndex];
            const nodeRefs = new Set(blueprint.nodes.map(n => n?.ref).filter(Boolean));
            const errors = [];
            if (updates.from !== undefined) { if (typeof updates.from !== 'string') errors.push('Edge from must be a string'); else if (!nodeRefs.has(updates.from)) errors.push(\`Source node does not exist: \${updates.from}\`); }
            if (updates.to !== undefined) { if (typeof updates.to !== 'string') errors.push('Edge to must be a string'); else if (!nodeRefs.has(updates.to)) errors.push(\`Target node does not exist: \${updates.to}\`); }
            if (updates.condition !== undefined && typeof updates.condition !== 'string') errors.push('Edge condition must be a string expression');
            if (updates.label !== undefined && typeof updates.label !== 'string') errors.push('Edge label must be a string');
            if (updates.metadata !== undefined && (typeof updates.metadata !== 'object' || Array.isArray(updates.metadata))) errors.push('Edge metadata must be an object');
            if (errors.length > 0) return { success: false, errors, toolData };
            const updatedEdge = { ...currentEdge };
            if (updates.from !== undefined) updatedEdge.from = updates.from;
            if (updates.to !== undefined) updatedEdge.to = updates.to;
            if (updates.condition !== undefined) updatedEdge.condition = updates.condition;
            if (updates.label !== undefined) updatedEdge.label = updates.label;
            if (updates.metadata !== undefined) updatedEdge.metadata = updates.metadata;
            const sanitizedEdge = { ref: updatedEdge.ref, from: updatedEdge.from, to: updatedEdge.to, ...(updatedEdge.condition !== undefined ? { condition: updatedEdge.condition } : {}), ...(updatedEdge.label !== undefined ? { label: updatedEdge.label } : {}), ...(updatedEdge.metadata !== undefined ? { metadata: updatedEdge.metadata } : {}) };
            blueprint.edges[edgeIndex] = sanitizedEdge;
            return { success: true, toolData, updatedBlueprint: blueprint, editedEdge: sanitizedEdge, edgeRef };
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

export const toolEditBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintEditEdgeTool.name,
  description: blueprintEditEdgeTool.description,
  parameters: blueprintEditEdgeTool.parameters,
  blueprint: blueprintEditEdgeTool.blueprint,

  slug: 'edit-tool-blueprint-edge',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "edgeRef": "edge1", "updates": { "to": "process" } }',
  requiresApiKey: false,
  configurationFields: [],
};


