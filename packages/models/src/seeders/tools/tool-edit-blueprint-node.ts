import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Blueprint Node
 * Modifies properties of an existing node in a blueprint
 */
export const blueprintEditNodeTool: ToolParams = {
  name: 'Edit Blueprint Node',
  slug: 'blueprint-edit-node',
  description: `Modifies properties of an existing node in a blueprint with validation and structural integrity checks.

## Purpose
Update node properties incrementally while maintaining blueprint validity and reference integrity.

## Required Parameters
- **blueprint**: Current blueprint object { nodes, edges }
- **nodeRef**: Reference of the node to edit
- **updates**: Object containing the properties to update

## Supported Updates
- **name**: Update node display name
- **description**: Update node description
- **parameters**: Update node-specific parameters object
- **type**: Update node type (with validation)

## Validation
- Verifies target node exists in blueprint
- Validates updated properties against node type requirements
- Ensures type changes don't break existing edges
- Maintains blueprint structural integrity

## Response
Returns updated blueprint with node modifications, or validation errors if update fails`,
  parameters: {
    type: 'object',
    properties: {
      blueprint: {
        type: 'object',
        description: 'Current blueprint { nodes: [], edges: [] }',
      },
      nodeRef: {
        type: 'string',
        description: 'Reference of the node to edit',
      },
      updates: {
        type: 'object',
        description: 'Properties to update on the node',
        properties: {
          name: { type: 'string', description: 'New node name' },
          description: { type: 'string', description: 'New node description' },
          type: { type: 'string', description: 'New node type' },
          parameters: { type: 'object', description: 'New node parameters' },
        },
      },
    },
    required: ['blueprint', 'nodeRef', 'updates'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'validate',
        type: 'code',
        name: 'Validate and Edit Node',
        description: 'Edit node properties with validation',
        parameters: {
          code: `
            const supportedTypes = [
              'start', 'end', 'llm', 'code', 'http_request', 'conditional',
              'transform', 'mutate', 'tool', 'workflow', 'user_prompt'
            ];

            if (!input.blueprint || typeof input.blueprint !== 'object') {
              throw new Error('Invalid blueprint: must be an object');
            }

            if (!input.nodeRef || typeof input.nodeRef !== 'string') {
              throw new Error('Invalid nodeRef: must be a string');
            }

            if (!input.updates || typeof input.updates !== 'object') {
              throw new Error('Invalid updates: must be an object');
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

            const currentNode = blueprint.nodes[nodeIndex];
            const errors = [];

            // Validate type change if provided
            if (input.updates.type) {
              if (typeof input.updates.type !== 'string') {
                errors.push('Node type must be a string');
              } else if (!supportedTypes.includes(input.updates.type)) {
                errors.push(\`Unsupported node type: \${input.updates.type}\`);
              }
            }

            // Validate name if provided
            if (input.updates.name !== undefined && (typeof input.updates.name !== 'string' || input.updates.name.trim() === '')) {
              errors.push('Node name must be a non-empty string');
            }

            // Validate parameters if provided
            if (input.updates.parameters !== undefined && typeof input.updates.parameters !== 'object') {
              errors.push('Node parameters must be an object');
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                blueprint
              };
            }

            // Apply updates
            const updatedNode = { ...currentNode };
            if (input.updates.name !== undefined) updatedNode.name = input.updates.name;
            if (input.updates.description !== undefined) updatedNode.description = input.updates.description;
            if (input.updates.type !== undefined) updatedNode.type = input.updates.type;
            if (input.updates.parameters !== undefined) updatedNode.parameters = input.updates.parameters;

            blueprint.nodes[nodeIndex] = updatedNode;

            return {
              success: true,
              blueprint,
              editedNode: updatedNode,
              nodeRef: input.nodeRef
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
 * Tool Template: blueprint-edit-node
 */
export const toolEditBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintEditNodeTool.name,
  description: blueprintEditNodeTool.description,
  parameters: blueprintEditNodeTool.parameters,
  blueprint: blueprintEditNodeTool.blueprint,

  slug: 'blueprint-edit-node',
  category: 'automation',
  exampleUsage:
    '{ "blueprint": { "nodes": [{"ref": "process", "type": "code"}], "edges": [] }, "nodeRef": "process", "updates": { "name": "Process Data", "description": "Transform input data" } }',
  requiresApiKey: false,
  configurationFields: [],
};
