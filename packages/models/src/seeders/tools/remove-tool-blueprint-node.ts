import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Remove Tool Blueprint Node
 * Removes a node from a blueprint and cleans up all connected edges
 */
export const blueprintRemoveNodeTool: ToolParams = {
  name: 'Remove Tool Blueprint Node',
  slug: 'remove-tool-blueprint-node',
  description: `Removes a node from a tool's blueprint and automatically cleans up all edges connected to it.`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: { type: 'string', description: 'Slug of the tool to modify' },
      nodeRef: { type: 'string', description: 'Reference of the node to remove' },
    },
    required: ['toolSlug', 'nodeRef'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'prepare', type: 'code', name: 'Prepare Request', description: 'Validate inputs', parameters: { code: `
            async function main(ctx) {
              if (!ctx.$input.toolSlug) throw new Error('toolSlug is required');
              if (!ctx.$input.nodeRef || typeof ctx.$input.nodeRef !== 'string') throw new Error('nodeRef is required and must be a string');
              return { toolSlug: ctx.$input.toolSlug, nodeRef: ctx.$input.nodeRef };
            }
          `, timeout: 3000 } },
      { ref: 'fetch_tool', type: 'http_request', name: 'Fetch Current Tool', description: 'GET /starships/self/tools/:toolSlug', parameters: { url: '{{ "/starships/self/tools/" + $lastOutputOf("prepare")[0].json.toolSlug }}', method: 'GET', connectorSlug: 'starships', timeout: 5000 } },
      { ref: 'validate', type: 'code', name: 'Validate and Remove Node', description: 'Remove node and clean up edges', parameters: { code: `
            async function main(ctx) {
              const fetchResponse = ctx.$lastOutputOf('fetch_tool')[0]?.json ?? {};
              const toolData = fetchResponse.body?.data || fetchResponse.body;
              if (!toolData || !toolData.blueprint) throw new Error('Tool not found or missing blueprint');
              const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
              if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
              if (!Array.isArray(blueprint.edges)) blueprint.edges = [];
              const nodeRef = ctx.$lastOutputOf('prepare')[0].json.nodeRef;
              const nodeIndex = blueprint.nodes.findIndex((n) => n?.ref === nodeRef);
              if (nodeIndex === -1) return { success: false, error: \`Node not found: \${nodeRef}\`, toolData };
              const nodeToRemove = blueprint.nodes[nodeIndex];
              const errors = [];
              if (nodeToRemove.type === 'start' || nodeToRemove.type === 'end') {
                const remainingStartNodes = blueprint.nodes.filter((n) => n?.type === 'start' && n.ref !== nodeRef).length;
                const remainingEndNodes = blueprint.nodes.filter((n) => n?.type === 'end' && n.ref !== nodeRef).length;
                if (nodeToRemove.type === 'start' && remainingStartNodes === 0) errors.push('Cannot remove last start node - workflow must have at least one start node');
                if (nodeToRemove.type === 'end' && remainingEndNodes === 0) errors.push('Cannot remove last end node - workflow must have at least one end node');
              }
              if (errors.length > 0) return { success: false, errors, toolData };
              const edgesToRemove = blueprint.edges.filter((e) => e?.from === nodeRef || e?.to === nodeRef);
              blueprint.edges = blueprint.edges.filter((e) => e?.from !== nodeRef && e?.to !== nodeRef);
              blueprint.nodes.splice(nodeIndex, 1);
              return { success: true, toolData, updatedBlueprint: blueprint, removedNode: nodeToRemove, removedEdges: edgesToRemove, nodeRef, remainingNodes: blueprint.nodes.length, remainingEdges: blueprint.edges.length };
            }
          `, timeout: 3000 } },
      { ref: 'update_tool', type: 'http_request', name: 'Update Tool with Modified Blueprint', description: 'PUT /tools/:id with updated blueprint', parameters: { url: '{{ $lastOutputOf("validate")[0].json.toolData.id ? "/tools/" + $lastOutputOf("validate")[0].json.toolData.id : "" }}', method: 'PUT', body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}', connectorSlug: 'starships', timeout: 10000 } },
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

export const toolRemoveBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintRemoveNodeTool.name,
  description: blueprintRemoveNodeTool.description,
  parameters: blueprintRemoveNodeTool.parameters,
  blueprint: blueprintRemoveNodeTool.blueprint,

  slug: 'remove-tool-blueprint-node',
  version: '1.0.2',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "nodeRef": "old_node" }',
  requiresApiKey: false,
  configurationFields: [],
};


