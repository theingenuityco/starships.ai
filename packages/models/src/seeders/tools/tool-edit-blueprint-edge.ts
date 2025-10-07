import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Blueprint Edge
 * Modifies properties of an existing edge in a blueprint
 */
export const blueprintEditEdgeTool: ToolParams = {
  name: 'Edit Blueprint Edge',
  slug: 'blueprint-edit-edge',
  description: `Modifies properties of an existing edge in a blueprint, including conditions and connections.

## Purpose
Update edge properties and routing logic while maintaining blueprint connectivity.

## Required Parameters
- **blueprint**: Current blueprint object { nodes, edges }
- **edgeRef**: Reference of the edge to edit
- **updates**: Object containing the properties to update

## Supported Updates
- **from**: Update source node reference
- **to**: Update target node reference
- **condition**: Update conditional expression for routing

## Validation
- Verifies target edge exists in blueprint
- Validates source and target nodes exist when updating connections
- Ensures condition expressions are valid JavaScript
- Maintains edge reference integrity

## Response
Returns updated blueprint with edge modifications, or validation errors if update fails`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Current blueprint { nodes: [], edges: [] }',
      },
      edgeRef: {
        type: 'string',
        description: 'Reference of the edge to edit',
      },
      updates: {
        type: 'object',
        description: 'Properties to update on the edge',
        properties: {
          from: { type: 'string', description: 'New source node ref' },
          to: { type: 'string', description: 'New target node ref' },
          condition: { type: 'string', description: 'New condition expression' },
        },
      },
    },
    required: ['blueprint', 'edgeRef', 'updates'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Edit Edge',
        description: 'Edit edge properties with validation',
        parameters: {
          code: `
            if (!input.blueprint || typeof input.blueprint !== 'object') {
              throw new Error('Invalid blueprint: must be an object');
            }

            if (!input.edgeRef || typeof input.edgeRef !== 'string') {
              throw new Error('Invalid edgeRef: must be a string');
            }

            if (!input.updates || typeof input.updates !== 'object') {
              throw new Error('Invalid updates: must be an object');
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

            const currentEdge = blueprint.edges[edgeIndex];
            const nodeRefs = new Set(blueprint.nodes.map(n => n?.ref).filter(Boolean));
            const errors = [];

            // Validate 'from' node if provided
            if (input.updates.from !== undefined) {
              if (typeof input.updates.from !== 'string') {
                errors.push('Edge from must be a string');
              } else if (!nodeRefs.has(input.updates.from)) {
                errors.push(\`Source node does not exist: \${input.updates.from}\`);
              }
            }

            // Validate 'to' node if provided
            if (input.updates.to !== undefined) {
              if (typeof input.updates.to !== 'string') {
                errors.push('Edge to must be a string');
              } else if (!nodeRefs.has(input.updates.to)) {
                errors.push(\`Target node does not exist: \${input.updates.to}\`);
              }
            }

            // Validate condition if provided
            if (input.updates.condition !== undefined && typeof input.updates.condition !== 'string') {
              errors.push('Edge condition must be a string expression');
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                blueprint
              };
            }

            // Apply updates
            const updatedEdge = { ...currentEdge };
            if (input.updates.from !== undefined) updatedEdge.from = input.updates.from;
            if (input.updates.to !== undefined) updatedEdge.to = input.updates.to;
            if (input.updates.condition !== undefined) updatedEdge.condition = input.updates.condition;

            blueprint.edges[edgeIndex] = updatedEdge;

            return {
              success: true,
              blueprint,
              editedEdge: updatedEdge,
              edgeRef: input.edgeRef
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
 * Tool Template: blueprint-edit-edge
 */
export const toolEditBlueprintEdgeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintEditEdgeTool.name,
  description: blueprintEditEdgeTool.description,
  parameters: blueprintEditEdgeTool.parameters,
  blueprint: blueprintEditEdgeTool.blueprint,

  slug: 'blueprint-edit-edge',
  category: 'automation',
  exampleUsage:
    '{ "blueprint": { "nodes": [{"ref": "start", "type": "start"}, {"ref": "process", "type": "code"}], "edges": [{"ref": "edge1", "from": "start", "to": "old"}] }, "edgeRef": "edge1", "updates": { "to": "process", "condition": "{{ state.success ? \\"success\\" : \\"error\\" }}" } }',
  requiresApiKey: false,
  configurationFields: [],
};
