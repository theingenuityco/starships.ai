import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Remove Blueprint Node
 * Removes a node from a blueprint and cleans up all connected edges
 */
export const blueprintRemoveNodeTool: ToolParams = {
  name: 'Remove Blueprint Node',
  slug: 'blueprint-remove-node',
  description: `Removes a node from a blueprint and automatically cleans up all edges connected to it.

## Purpose
Safely remove nodes while maintaining blueprint integrity by cascading edge removal.

## Required Parameters
- **blueprint**: Current blueprint object { nodes, edges }
- **nodeRef**: Reference of the node to remove

## Safety Features
- Validates target node exists before removal
- Automatically removes all edges connected to the node
- Prevents removal of start/end nodes if they would break workflow
- Maintains edge reference integrity

## Edge Cleanup
- Removes all edges where the node is source (from)
- Removes all edges where the node is target (to)
- Preserves edges between remaining nodes

## Response
Returns updated blueprint with node and edges removed, or errors if removal would break workflow`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Current blueprint { nodes: [], edges: [] }',
      },
      nodeRef: {
        type: 'string',
        description: 'Reference of the node to remove',
      },
    },
    required: ['blueprint', 'nodeRef'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Remove Node',
        description: 'Remove node and clean up edges',
        parameters: {
          code: `
            if (!input.blueprint || typeof input.blueprint !== 'object') {
              throw new Error('Invalid blueprint: must be an object');
            }

            if (!input.nodeRef || typeof input.nodeRef !== 'string') {
              throw new Error('Invalid nodeRef: must be a string');
            }

            const blueprint = JSON.parse(JSON.stringify(input.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

            const nodeIndex = blueprint.nodes.findIndex(n => n?.ref === input.nodeRef);
            if (nodeIndex === -1) {
              return {
                success: false,
                error: \`Node not found: \${input.nodeRef}\`,
                blueprint
              };
            }

            const nodeToRemove = blueprint.nodes[nodeIndex];
            const errors = [];

            // Check if this is a start or end node
            if (nodeToRemove.type === 'start' || nodeToRemove.type === 'end') {
              const remainingStartNodes = blueprint.nodes.filter(n => n?.type === 'start' && n.ref !== input.nodeRef).length;
              const remainingEndNodes = blueprint.nodes.filter(n => n?.type === 'end' && n.ref !== input.nodeRef).length;

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
                blueprint
              };
            }

            // Remove edges connected to this node
            const edgesToRemove = blueprint.edges.filter(e =>
              e?.from === input.nodeRef || e?.to === input.nodeRef
            );

            blueprint.edges = blueprint.edges.filter(e =>
              e?.from !== input.nodeRef && e?.to !== input.nodeRef
            );

            // Remove the node
            blueprint.nodes.splice(nodeIndex, 1);

            return {
              success: true,
              blueprint,
              removedNode: nodeToRemove,
              removedEdges: edgesToRemove,
              nodeRef: input.nodeRef,
              remainingNodes: blueprint.nodes.length,
              remainingEdges: blueprint.edges.length
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated blueprint or validation errors',
        parameters: {
          output: '{{ $lastOutputOf("validate")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'validate' },
      { ref: 'e2', from: 'validate', to: 'end_1' },
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
  exampleUsage: '{ "blueprint": { "nodes": [{"ref": "old_node", "type": "code"}], "edges": [] }, "nodeRef": "old_node" }',
  requiresApiKey: false,
  configurationFields: [],
};
