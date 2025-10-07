import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Remove Blueprint Edge
 * Removes an edge from a blueprint
 */
export const blueprintRemoveEdgeTool: ToolParams = {
  name: 'Remove Blueprint Edge',
  slug: 'blueprint-remove-edge',
  description: `Removes an edge from a blueprint while maintaining node integrity.

## Purpose
Clean up unnecessary or incorrect edge connections in blueprint workflows.

## Required Parameters
- **blueprint**: Current blueprint object { nodes, edges }
- **edgeRef**: Reference of the edge to remove

## Safety Features
- Validates target edge exists before removal
- Only removes the specified edge
- Preserves all nodes and other edges
- Maintains blueprint structural integrity

## Response
Returns updated blueprint with edge removed, or error if edge not found`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Current blueprint { nodes: [], edges: [] }',
      },
      edgeRef: {
        type: 'string',
        description: 'Reference of the edge to remove',
      },
    },
    required: ['blueprint', 'edgeRef'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Remove Edge',
        description: 'Remove edge from blueprint',
        parameters: {
          code: `
            if (!input.blueprint || typeof input.blueprint !== 'object') {
              throw new Error('Invalid blueprint: must be an object');
            }

            if (!input.edgeRef || typeof input.edgeRef !== 'string') {
              throw new Error('Invalid edgeRef: must be a string');
            }

            const blueprint = JSON.parse(JSON.stringify(input.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

            const edgeIndex = blueprint.edges.findIndex(e => e?.ref === input.edgeRef);
            if (edgeIndex === -1) {
              return {
                success: false,
                error: \`Edge not found: \${input.edgeRef}\`,
                blueprint
              };
            }

            const removedEdge = blueprint.edges[edgeIndex];

            // Remove the edge
            blueprint.edges.splice(edgeIndex, 1);

            return {
              success: true,
              blueprint,
              removedEdge,
              edgeRef: input.edgeRef,
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
 * Tool Template: blueprint-remove-edge
 */
export const toolRemoveBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintRemoveEdgeTool.name,
  description: blueprintRemoveEdgeTool.description,
  parameters: blueprintRemoveEdgeTool.parameters,
  blueprint: blueprintRemoveEdgeTool.blueprint,

  slug: 'blueprint-remove-edge',
  category: 'automation',
  exampleUsage:
    '{ "blueprint": { "nodes": [{"ref": "start", "type": "start"}], "edges": [{"ref": "old_edge", "from": "start", "to": "end"}] }, "edgeRef": "old_edge" }',
  requiresApiKey: false,
  configurationFields: [],
};
