import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Add Tool Blueprint Edge
 * Adds a new edge between nodes in an existing tool's blueprint with validation
 */
export const toolAddBlueprintEdgeTool: ToolParams = {
  name: 'Add Tool Blueprint Edge',
  slug: 'tool-add-blueprint-edge',
  description: `Adds a new edge between existing nodes in a blueprint with automatic validation and connectivity checks.

## Purpose
Incrementally build blueprint connectivity by adding edges one at a time, ensuring proper workflow flow.

## Required Parameters
- **blueprint**: Current blueprint object { nodes, edges }
- **edge**: New edge to add with from, to, ref, and optional condition

## Edge Requirements
- **ref**: Unique identifier (string)
- **from**: Source node ref (must exist in blueprint)
- **to**: Target node ref (must exist in blueprint)
- **condition**: Optional JavaScript expression for conditional routing

## Validation
- Verifies source and target nodes exist in blueprint
- Checks for ref uniqueness within blueprint
- Ensures edge creates valid workflow paths
- Validates condition expressions when provided

## Response
Returns updated blueprint with new edge added, or validation errors if addition fails`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Current blueprint { nodes: [], edges: [] }',
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
    required: ['blueprint', 'edge'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Add Edge',
        description: 'Add edge to blueprint with validation',
        parameters: {
          code: `
            if (!input.blueprint || typeof input.blueprint !== 'object') {
              throw new Error('Invalid blueprint: must be an object');
            }

            if (!input.edge || typeof input.edge !== 'object') {
              throw new Error('Invalid edge: must be an object');
            }

            const blueprint = { ...input.blueprint };
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

            const newEdge = input.edge;
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
                blueprint: blueprint
              };
            }

            // Add the edge
            blueprint.edges.push(newEdge);

            return {
              success: true,
              blueprint,
              addedEdge: newEdge,
              edgeCount: blueprint.edges.length
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
 * Tool Template: tool-add-blueprint-edge
 */
export const toolAddBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolAddBlueprintEdgeTool.name,
  description: toolAddBlueprintEdgeTool.description,
  parameters: toolAddBlueprintEdgeTool.parameters,
  blueprint: toolAddBlueprintEdgeTool.blueprint,

  slug: 'tool-add-blueprint-edge',
  category: 'automation',
  exampleUsage:
    '{ "blueprint": { "nodes": [{"ref": "start", "type": "start", "name": "Start"}], "edges": [] }, "edge": { "ref": "to_process", "from": "start", "to": "process" } }',
  requiresApiKey: false,
  configurationFields: [],
};
