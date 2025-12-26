import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Modify Tool Blueprint Node
 * Adds, edits, or removes a node in a tool's blueprint using a single op argument.
 */
export const blueprintModifyNodeTool: ToolParams = {
  name: 'Modify Tool Blueprint Node',
  slug: 'modify-tool-blueprint-node',
  description: `Adds, edits, or removes a node in an existing tool's blueprint using a single unified interface.

## Purpose
Unify node-level blueprint operations (add, edit, remove) behind a single tool so Daedalus and other agents don't need to juggle multiple tool variants.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **op**: Operation to perform: "add", "edit", or "remove"

## Operation-specific Parameters
- **op = "add"**
  - **node**: Full node definition to add (ref, type, name, description?, parameters?)

- **op = "edit"**
  - **nodeRef**: Reference of the existing node to edit
  - **updates**: Partial node definition with properties to update

- **op = "remove"**
  - **nodeRef**: Reference of the existing node to remove (all connected edges are also removed)

## Response
Returns the updated tool (with modified blueprint) or validation errors if the operation fails.`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
      },
      op: {
        type: 'string',
        enum: ['add', 'edit', 'remove'],
        description: 'Operation to perform: add, edit, or remove',
      },
      node: {
        type: 'object',
        description: 'Full node definition (required for op = "add")',
      },
      nodeRef: {
        type: 'string',
        description: 'Reference of the node to edit/remove (required for op = "edit" or "remove")',
      },
      updates: {
        type: 'object',
        description: 'Partial node definition with properties to update (required for op = "edit")',
      },
    },
    required: ['toolSlug', 'op'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Validate inputs and normalize operation payload',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const op = input.op;

              if (!input.toolSlug || typeof input.toolSlug !== 'string') {
                throw new Error('toolSlug is required and must be a string');
              }

              const allowedOps = ['add', 'edit', 'remove'];
              if (!op || typeof op !== 'string' || !allowedOps.includes(op)) {
                throw new Error('op is required and must be one of: add, edit, remove');
              }

              if (op === 'add') {
                if (!input.node || typeof input.node !== 'object') {
                  throw new Error('node is required and must be an object when op = "add"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  node: input.node,
                };
              }

              if (op === 'edit') {
                if (!input.nodeRef || typeof input.nodeRef !== 'string') {
                  throw new Error('nodeRef is required and must be a string when op = "edit"');
                }
                if (!input.updates || typeof input.updates !== 'object') {
                  throw new Error('updates is required and must be an object when op = "edit"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  nodeRef: input.nodeRef,
                  updates: input.updates,
                };
              }

              if (op === 'remove') {
                if (!input.nodeRef || typeof input.nodeRef !== 'string') {
                  throw new Error('nodeRef is required and must be a string when op = "remove"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  nodeRef: input.nodeRef,
                };
              }

              throw new Error('Unsupported op: ' + op);
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'fetch_tool',
        type: 'connector_action',
        name: 'Fetch Current Tool',
        description: 'GET /starships/:starshipId/tools/:toolSlug',
        parameters: {
          connector: 'starships',
          action: 'get-tool',
          args: {
            starshipId: '{{ env("STARSHIP_ID") }}',
            slug: '{{ (lastOutputOf("prepare") || {}).toolSlug }}',
          },
          timeout: 5000,
        },
      },
      {
        ref: 'modify_node',
        type: 'code',
        name: 'Apply Node Operation',
        description: 'Add, edit, or remove a node with validation and integrity checks',
        parameters: {
          code: `
            async function main(ctx) {
              const supportedTypes = [
                'start',
                'end',
                'llm',
                'code',
                'http_request',
                'conditional',
                'transform',
                'mutate',
                'tool',
                'workflow',
                'user_prompt',
              ];

              const fetchResponse = ctx.lastOutputOf('fetch_tool') || {};
              const toolData = fetchResponse.body?.data || fetchResponse.body;

              if (!toolData || !toolData.blueprint) {
                throw new Error('Tool not found or missing blueprint');
              }

              const payload = ctx.lastOutputOf('prepare') || {};
              const op = payload.op;

              const blueprint = JSON.parse(JSON.stringify(toolData.blueprint || {}));
              if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
              if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

              const errors = [];

              if (op === 'add') {
                const newNode = payload.node || {};

                // Validate node structure (based on add-tool-blueprint-node)
                if (!newNode.ref || typeof newNode.ref !== 'string') {
                  errors.push('Node must have a valid ref (string)');
                }
                if (!newNode.type || typeof newNode.type !== 'string') {
                  errors.push('Node must have a valid type (string)');
                } else if (!supportedTypes.includes(newNode.type)) {
                  errors.push(\`Unsupported node type: \${newNode.type}\`);
                }
                if (!newNode.name || typeof newNode.name !== 'string') {
                  errors.push('Node must have a valid name (string)');
                }
                if (!newNode.parameters || typeof newNode.parameters !== 'object') {
                  newNode.parameters = {};
                }
                const existingRefs = new Set(
                  blueprint.nodes.map((n) => n?.ref).filter(Boolean)
                );
                if (existingRefs.has(newNode.ref)) {
                  errors.push(\`Node ref already exists: \${newNode.ref}\`);
                }

                if (errors.length > 0) {
                  return {
                    success: false,
                    op,
                    errors,
                    toolData,
                  };
                }

                blueprint.nodes.push(newNode);

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  addedNode: newNode,
                  nodeCount: blueprint.nodes.length,
                };
              }

              if (op === 'edit') {
                const nodeRef = payload.nodeRef;
                const updates = payload.updates || {};

                const nodeIndex = blueprint.nodes.findIndex((n) => n?.ref === nodeRef);
                if (nodeIndex === -1) {
                  return {
                    success: false,
                    op,
                    error: \`Node not found: \${nodeRef}\`,
                    toolData,
                  };
                }

                const currentNode = blueprint.nodes[nodeIndex];

                if (updates.type) {
                  if (typeof updates.type !== 'string') {
                    errors.push('Node type must be a string');
                  } else if (!supportedTypes.includes(updates.type)) {
                    errors.push(\`Unsupported node type: \${updates.type}\`);
                  }
                }
                if (
                  updates.name !== undefined &&
                  (typeof updates.name !== 'string' || updates.name.trim() === '')
                ) {
                  errors.push('Node name must be a non-empty string');
                }
                if (updates.parameters !== undefined && typeof updates.parameters !== 'object') {
                  errors.push('Node parameters must be an object');
                }

                if (errors.length > 0) {
                  return {
                    success: false,
                    op,
                    errors,
                    toolData,
                  };
                }

                const updatedNode = { ...currentNode };
                if (updates.name !== undefined) updatedNode.name = updates.name;
                if (updates.description !== undefined) updatedNode.description = updates.description;
                if (updates.type !== undefined) updatedNode.type = updates.type;
                if (updates.parameters !== undefined) updatedNode.parameters = updates.parameters;

                blueprint.nodes[nodeIndex] = updatedNode;

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  editedNode: updatedNode,
                  nodeRef,
                };
              }

              if (op === 'remove') {
                const nodeRef = payload.nodeRef;
                const nodeIndex = blueprint.nodes.findIndex((n) => n?.ref === nodeRef);
                if (nodeIndex === -1) {
                  return {
                    success: false,
                    op,
                    error: \`Node not found: \${nodeRef}\`,
                    toolData,
                  };
                }

                const nodeToRemove = blueprint.nodes[nodeIndex];

                // Enforce basic structural rules (inspired by remove-tool-blueprint-node)
                if (nodeToRemove.type === 'start' || nodeToRemove.type === 'end') {
                  const remainingStartNodes = blueprint.nodes.filter(
                    (n) => n?.type === 'start' && n.ref !== nodeRef
                  ).length;
                  const remainingEndNodes = blueprint.nodes.filter(
                    (n) => n?.type === 'end' && n.ref !== nodeRef
                  ).length;

                  if (nodeToRemove.type === 'start' && remainingStartNodes === 0) {
                    errors.push(
                      'Cannot remove last start node - workflow must have at least one start node'
                    );
                  }
                  if (nodeToRemove.type === 'end' && remainingEndNodes === 0) {
                    errors.push(
                      'Cannot remove last end node - workflow must have at least one end node'
                    );
                  }
                }

                if (errors.length > 0) {
                  return {
                    success: false,
                    op,
                    errors,
                    toolData,
                  };
                }

                const edgesToRemove = blueprint.edges.filter(
                  (e) => e?.from === nodeRef || e?.to === nodeRef
                );

                blueprint.edges = blueprint.edges.filter(
                  (e) => e?.from !== nodeRef && e?.to !== nodeRef
                );
                blueprint.nodes.splice(nodeIndex, 1);

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  removedNode: nodeToRemove,
                  removedEdges: edgesToRemove,
                  nodeRef,
                  remainingNodes: blueprint.nodes.length,
                  remainingEdges: blueprint.edges.length,
                };
              }

              return {
                success: false,
                op,
                error: 'Unsupported operation',
                toolData,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'route_update',
        type: 'conditional',
        name: 'Route Update',
        description: 'Only persist changes when modify_node succeeded',
        parameters: {
          condition: '{{ !!(lastOutputOf("modify_node") || {}).success }}',
        },
      },
      {
        ref: 'update_tool',
        type: 'connector_action',
        name: 'Update Tool with Modified Blueprint',
        description: 'PUT /tools/:id with updated blueprint',
        parameters: {
          connector: 'starships',
          action: 'update-tool',
          args: '{{ (() => { const result = lastOutputOf("modify_node") || {}; return { toolId: result.toolData && result.toolData.id ? String(result.toolData.id) : "", blueprint: result.updatedBlueprint }; })() }}',
          timeout: 10000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated tool or validation errors',
        parameters: {
          output: '{{ lastOutputOf("update_tool") || lastOutputOf("modify_node") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'modify_node' },
      { ref: 'e4', from: 'modify_node', to: 'route_update' },
      { ref: 'e5', from: 'route_update', to: 'update_tool', condition: 'true' },
      { ref: 'e6', from: 'update_tool', to: 'end_1' },
      { ref: 'e7', from: 'route_update', to: 'end_1', condition: 'false' },
    ],
    metadata: {},
  },
};

export const toolModifyBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintModifyNodeTool.name,
  description: blueprintModifyNodeTool.description,
  parameters: blueprintModifyNodeTool.parameters,
  blueprint: blueprintModifyNodeTool.blueprint,

  slug: 'modify-tool-blueprint-node',
  version: '1.0.0',
  category: 'automation',
  exampleUsage:
    '{ "toolSlug": "my-tool", "op": "add", "node": { "ref": "process", "type": "code", "name": "Process Data", "parameters": { "code": "return input;" } } }',
  requiresApiKey: false,
  configurationFields: [],
};
