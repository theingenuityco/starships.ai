import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Modify Tool Blueprint Edge
 * Adds, edits, or removes an edge in a tool's blueprint using a single op argument.
 */
export const blueprintModifyEdgeTool: ToolParams = {
  name: 'Modify Tool Blueprint Edge',
  slug: 'modify-tool-blueprint-edge',
  description: `Adds, edits, or removes an edge in an existing tool's blueprint using a single unified interface.

## Purpose
Unify edge-level blueprint operations (add, edit, remove) behind a single tool so Daedalus and other agents don't need to juggle multiple tool variants.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **op**: Operation to perform: "add", "edit", or "remove"

## Operation-specific Parameters
- **op = "add"**
  - **edge**: Full edge definition to add (ref, from, to, condition?, label?, metadata?)

- **op = "edit"**
  - **edgeRef**: Reference of the existing edge to edit
  - **updates**: Partial edge definition with properties to update

- **op = "remove"**
  - **edgeRef**: Reference of the existing edge to remove

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
      edge: {
        type: 'object',
        description: 'Full edge definition (required for op = "add")',
      },
      edgeRef: {
        type: 'string',
        description: 'Reference of the edge to edit/remove (required for op = "edit" or "remove")',
      },
      updates: {
        type: 'object',
        description: 'Partial edge definition with properties to update (required for op = "edit")',
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
                if (!input.edge || typeof input.edge !== 'object') {
                  throw new Error('edge is required and must be an object when op = "add"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  edge: input.edge,
                };
              }

              if (op === 'edit') {
                if (!input.edgeRef || typeof input.edgeRef !== 'string') {
                  throw new Error('edgeRef is required and must be a string when op = "edit"');
                }
                if (!input.updates || typeof input.updates !== 'object') {
                  throw new Error('updates is required and must be an object when op = "edit"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  edgeRef: input.edgeRef,
                  updates: input.updates,
                };
              }

              if (op === 'remove') {
                if (!input.edgeRef || typeof input.edgeRef !== 'string') {
                  throw new Error('edgeRef is required and must be a string when op = "remove"');
                }
                return {
                  toolSlug: input.toolSlug,
                  op,
                  edgeRef: input.edgeRef,
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
        ref: 'modify_edge',
        type: 'code',
        name: 'Apply Edge Operation',
        description: 'Add, edit, or remove an edge with validation and integrity checks',
        parameters: {
          code: `
            async function main(ctx) {
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
                const edge = payload.edge || {};

                // Validate edge structure (based on add-tool-blueprint-edge)
                if (!edge.ref || typeof edge.ref !== 'string') {
                  errors.push('Edge must have a valid ref (string)');
                }
                if (!edge.from || typeof edge.from !== 'string') {
                  errors.push('Edge must have a valid from (string)');
                }
                if (!edge.to || typeof edge.to !== 'string') {
                  errors.push('Edge must have a valid to (string)');
                }

                const nodeRefs = new Set(
                  blueprint.nodes.map((n) => n?.ref).filter(Boolean)
                );
                if (edge.from && !nodeRefs.has(edge.from)) {
                  errors.push(\`Unknown from node: \${edge.from}\`);
                }
                if (edge.to && !nodeRefs.has(edge.to)) {
                  errors.push(\`Unknown to node: \${edge.to}\`);
                }

                const existingRefs = new Set(
                  blueprint.edges.map((e) => e?.ref).filter(Boolean)
                );
                if (existingRefs.has(edge.ref)) {
                  errors.push(\`Edge ref already exists: \${edge.ref}\`);
                }

                if (errors.length > 0) {
                  return {
                    success: false,
                    op,
                    errors,
                    toolData,
                  };
                }

                const normalizedEdge = {
                  ref: edge.ref,
                  from: edge.from,
                  to: edge.to,
                  ...(edge.condition ? { condition: edge.condition } : {}),
                  ...(edge.label ? { label: edge.label } : {}),
                  ...(edge.metadata ? { metadata: edge.metadata } : {}),
                };

                blueprint.edges.push(normalizedEdge);

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  addedEdge: normalizedEdge,
                  edgeCount: blueprint.edges.length,
                };
              }

              if (op === 'edit') {
                const edgeRef = payload.edgeRef;
                const updates = payload.updates || {};

                const edgeIndex = blueprint.edges.findIndex((e) => e?.ref === edgeRef);
                if (edgeIndex === -1) {
                  return {
                    success: false,
                    op,
                    error: \`Edge not found: \${edgeRef}\`,
                    toolData,
                  };
                }

                const currentEdge = blueprint.edges[edgeIndex];
                const nodeRefs = new Set(
                  blueprint.nodes.map((n) => n?.ref).filter(Boolean)
                );

                if (updates.from !== undefined) {
                  if (typeof updates.from !== 'string') {
                    errors.push('Edge from must be a string');
                  } else if (!nodeRefs.has(updates.from)) {
                    errors.push(\`Source node does not exist: \${updates.from}\`);
                  }
                }
                if (updates.to !== undefined) {
                  if (typeof updates.to !== 'string') {
                    errors.push('Edge to must be a string');
                  } else if (!nodeRefs.has(updates.to)) {
                    errors.push(\`Target node does not exist: \${updates.to}\`);
                  }
                }
                if (updates.condition !== undefined && typeof updates.condition !== 'string') {
                  errors.push('Edge condition must be a string expression');
                }
                if (updates.label !== undefined && typeof updates.label !== 'string') {
                  errors.push('Edge label must be a string');
                }
                if (
                  updates.metadata !== undefined &&
                  (typeof updates.metadata !== 'object' || Array.isArray(updates.metadata))
                ) {
                  errors.push('Edge metadata must be an object');
                }

                if (errors.length > 0) {
                  return {
                    success: false,
                    op,
                    errors,
                    toolData,
                  };
                }

                const updatedEdge = { ...currentEdge };
                if (updates.from !== undefined) updatedEdge.from = updates.from;
                if (updates.to !== undefined) updatedEdge.to = updates.to;
                if (updates.condition !== undefined) updatedEdge.condition = updates.condition;
                if (updates.label !== undefined) updatedEdge.label = updates.label;
                if (updates.metadata !== undefined) updatedEdge.metadata = updates.metadata;

                const sanitizedEdge = {
                  ref: updatedEdge.ref,
                  from: updatedEdge.from,
                  to: updatedEdge.to,
                  ...(updatedEdge.condition !== undefined ? { condition: updatedEdge.condition } : {}),
                  ...(updatedEdge.label !== undefined ? { label: updatedEdge.label } : {}),
                  ...(updatedEdge.metadata !== undefined ? { metadata: updatedEdge.metadata } : {}),
                };

                blueprint.edges[edgeIndex] = sanitizedEdge;

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  editedEdge: sanitizedEdge,
                  edgeRef,
                };
              }

              if (op === 'remove') {
                const edgeRef = payload.edgeRef;
                const edgeIndex = blueprint.edges.findIndex((e) => e?.ref === edgeRef);
                if (edgeIndex === -1) {
                  return {
                    success: false,
                    op,
                    error: \`Edge not found: \${edgeRef}\`,
                    toolData,
                  };
                }

                const removedEdge = blueprint.edges[edgeIndex];
                blueprint.edges.splice(edgeIndex, 1);

                return {
                  success: true,
                  op,
                  toolData,
                  updatedBlueprint: blueprint,
                  removedEdge,
                  edgeRef,
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
        description: 'Only persist changes when modify_edge succeeded',
        parameters: {
          condition: '{{ !!(lastOutputOf("modify_edge") || {}).success }}',
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
          args: '{{ (() => { const result = lastOutputOf("modify_edge") || {}; return { toolId: result.toolData && result.toolData.id ? String(result.toolData.id) : "", blueprint: result.updatedBlueprint }; })() }}',
          timeout: 10000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return updated tool or validation errors',
        parameters: {
          output: '{{ lastOutputOf("update_tool") || lastOutputOf("modify_edge") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'fetch_tool' },
      { ref: 'e3', from: 'fetch_tool', to: 'modify_edge' },
      { ref: 'e4', from: 'modify_edge', to: 'route_update' },
      { ref: 'e5', from: 'route_update', to: 'update_tool', condition: 'true' },
      { ref: 'e6', from: 'update_tool', to: 'end_1' },
      { ref: 'e7', from: 'route_update', to: 'end_1', condition: 'false' },
    ],
    metadata: {},
  },
};

export const toolModifyBlueprintEdgeToolTemplate: Omit<
  ToolTemplateModel,
  'id' | 'createdAt' | 'updatedAt' | 'usageCount'
> = {
  name: blueprintModifyEdgeTool.name,
  description: blueprintModifyEdgeTool.description,
  parameters: blueprintModifyEdgeTool.parameters,
  blueprint: blueprintModifyEdgeTool.blueprint,

  slug: 'modify-tool-blueprint-edge',
  version: '1.0.0',
  category: 'automation',
  exampleUsage:
    '{ "toolSlug": "my-tool", "op": "add", "edge": { "ref": "edge_process", "from": "start", "to": "process" } }',
  requiresApiKey: false,
  configurationFields: [],
};



