import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Remove Blueprint Node
 * Removes a node from a blueprint and cleans up all connected edges
 */
export const blueprintRemoveNodeTool: ToolParams = {
  name: 'Remove Blueprint Node',
  slug: 'blueprint-remove-node',
  description: `Removes a node from a tool's blueprint and automatically cleans up all edges connected to it.

## Purpose
Safely remove nodes while maintaining blueprint integrity by cascading edge removal.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **nodeRef**: Reference of the node to remove

## Safety Features
- Validates target node exists before removal
- Automatically removes all edges connected to the node
- Prevents removal of start/end nodes if they would break workflow
- Maintains edge reference integrity

## Workflow
1. Fetches current tool by slug
2. Validates target node exists before removal
3. Automatically removes all edges connected to the node
4. Updates tool with modified blueprint

## Edge Cleanup
- Removes all edges where the node is source (from)
- Removes all edges where the node is target (to)
- Preserves edges between remaining nodes

## Validation
- Verifies tool exists and is accessible
- Validates target node exists before removal
- Prevents removal of start/end nodes if they would break workflow

## Response
Returns updated tool with node and edges removed, or errors if removal would break workflow`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
      },
      nodeRef: {
        type: 'string',
        description: 'Reference of the node to remove',
      },
    },
    required: ['toolSlug', 'nodeRef'],
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

            if (!input.nodeRef || typeof input.nodeRef !== 'string') {
              throw new Error('nodeRef is required and must be a string');
            }

            return {
              baseUrl,
              starshipId,
              toolSlug: input.toolSlug,
              nodeRef: input.nodeRef,
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
        name: 'Validate and Remove Node',
        description: 'Remove node and clean up edges',
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

            const nodeRef = $lastOutputOf('prepare')[0].json.nodeRef;

            const nodeIndex = blueprint.nodes.findIndex(n => n?.ref === nodeRef);
            if (nodeIndex === -1) {
              return {
                success: false,
                error: \`Node not found: \${nodeRef}\`,
                toolData
              };
            }

            const nodeToRemove = blueprint.nodes[nodeIndex];
            const errors = [];

            // Check if this is a start or end node
            if (nodeToRemove.type === 'start' || nodeToRemove.type === 'end') {
              const remainingStartNodes = blueprint.nodes.filter(n => n?.type === 'start' && n.ref !== nodeRef).length;
              const remainingEndNodes = blueprint.nodes.filter(n => n?.type === 'end' && n.ref !== nodeRef).length;

              if (nodeToRemove.type === 'start' && remainingStartNodes === 0) {
                errors.push('Cannot remove last start node - workflow must have at least one start node');
              }
              if (nodeToRemove.type === 'end' && remainingEndNodes === 0) {
                errors.push('Cannot remove last end node - workflow must have at least one end node');
              }
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                toolData
              };
            }

            // Remove edges connected to this node
            const edgesToRemove = blueprint.edges.filter(e =>
              e?.from === nodeRef || e?.to === nodeRef
            );

            blueprint.edges = blueprint.edges.filter(e =>
              e?.from !== nodeRef && e?.to !== nodeRef
            );

            // Remove the node
            blueprint.nodes.splice(nodeIndex, 1);

            return {
              success: true,
              toolData,
              updatedBlueprint: blueprint,
              removedNode: nodeToRemove,
              removedEdges: edgesToRemove,
              nodeRef,
              remainingNodes: blueprint.nodes.length,
              remainingEdges: blueprint.edges.length
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'update_tool',
        type: 'http_request',
        name: 'Update Tool with Modified Blueprint',
        description: 'PUT /tools/:id with updated blueprint',
        parameters: {
          url: '{{ $lastOutputOf("validate")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate")[0].json.toolData.id : "" }}',
          method: 'PUT',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; if (result.success) { return { ...result.toolData, blueprint: result.updatedBlueprint }; } else { return result.toolData; } })() }}',
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
 * Tool Template: blueprint-remove-node
 */
export const toolRemoveBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintRemoveNodeTool.name,
  description: blueprintRemoveNodeTool.description,
  parameters: blueprintRemoveNodeTool.parameters,
  blueprint: blueprintRemoveNodeTool.blueprint,

  slug: 'blueprint-remove-node',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "nodeRef": "old_node" }',
  requiresApiKey: false,
  configurationFields: [],
};
