import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Blueprint Edge
 * Modifies properties of an existing edge in a blueprint
 */
export const blueprintEditEdgeTool: ToolParams = {
  name: 'Edit Blueprint Edge',
  slug: 'blueprint-edit-edge',
  description: `Modifies properties of an existing edge in a tool's blueprint, including conditions and connections.

## Purpose
Update edge properties and routing logic while maintaining blueprint connectivity.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **edgeRef**: Reference of the edge to edit
- **updates**: Object containing the properties to update

## Supported Updates
- **from**: Update source node reference
- **to**: Update target node reference
- **condition**: Update conditional expression for routing

## Workflow
1. Fetches current tool by slug
2. Validates target edge exists in blueprint
3. Validates source and target nodes exist when updating connections
4. Updates tool with modified blueprint

## Validation
- Verifies tool exists and is accessible
- Verifies target edge exists in blueprint
- Validates source and target nodes exist when updating connections
- Ensures condition expressions are valid JavaScript
- Maintains edge reference integrity

## Response
Returns updated tool with edge modifications, or validation errors if update fails`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
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
    required: ['toolSlug', 'edgeRef', 'updates'],
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

            if (!input.edgeRef || typeof input.edgeRef !== 'string') {
              throw new Error('edgeRef is required and must be a string');
            }

            if (!input.updates || typeof input.updates !== 'object') {
              throw new Error('updates is required and must be an object');
            }

            return {
              baseUrl,
              starshipId,
              toolSlug: input.toolSlug,
              edgeRef: input.edgeRef,
              updates: input.updates,
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
        name: 'Validate and Edit Edge',
        description: 'Edit edge properties with validation',
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

            const edgeRef = $lastOutputOf('prepare')[0].json.edgeRef;
            const updates = $lastOutputOf('prepare')[0].json.updates;

            const edgeIndex = blueprint.edges.findIndex(e => e?.ref === edgeRef);
            if (edgeIndex === -1) {
              return {
                success: false,
                error: \`Edge not found: \${edgeRef}\`,
                toolData
              };
            }

            const currentEdge = blueprint.edges[edgeIndex];
            const nodeRefs = new Set(blueprint.nodes.map(n => n?.ref).filter(Boolean));
            const errors = [];

            // Validate 'from' node if provided
            if (updates.from !== undefined) {
              if (typeof updates.from !== 'string') {
                errors.push('Edge from must be a string');
              } else if (!nodeRefs.has(updates.from)) {
                errors.push(\`Source node does not exist: \${updates.from}\`);
              }
            }

            // Validate 'to' node if provided
            if (updates.to !== undefined) {
              if (typeof updates.to !== 'string') {
                errors.push('Edge to must be a string');
              } else if (!nodeRefs.has(updates.to)) {
                errors.push(\`Target node does not exist: \${updates.to}\`);
              }
            }

            // Validate condition if provided
            if (updates.condition !== undefined && typeof updates.condition !== 'string') {
              errors.push('Edge condition must be a string expression');
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                toolData
              };
            }

            // Apply updates
            const updatedEdge = { ...currentEdge };
            if (updates.from !== undefined) updatedEdge.from = updates.from;
            if (updates.to !== undefined) updatedEdge.to = updates.to;
            if (updates.condition !== undefined) updatedEdge.condition = updates.condition;

            blueprint.edges[edgeIndex] = updatedEdge;

            return {
              success: true,
              toolData,
              updatedBlueprint: blueprint,
              editedEdge: updatedEdge,
              edgeRef
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
    '{ "toolSlug": "my-tool", "edgeRef": "edge1", "updates": { "to": "process", "condition": "{{ state.success ? \\"success\\" : \\"error\\" }}" } }',
  requiresApiKey: false,
  configurationFields: [],
};
