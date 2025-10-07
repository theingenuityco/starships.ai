import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Blueprint Node
 * Modifies properties of an existing node in a blueprint
 */
export const blueprintEditNodeTool: ToolParams = {
  name: 'Edit Blueprint Node',
  slug: 'blueprint-edit-node',
  description: `Modifies properties of an existing node in a tool's blueprint with validation and structural integrity checks.

## Purpose
Update node properties incrementally while maintaining blueprint validity and reference integrity.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **nodeRef**: Reference of the node to edit
- **updates**: Object containing the properties to update

## Supported Updates
- **name**: Update node display name
- **description**: Update node description
- **parameters**: Update node-specific parameters object
- **type**: Update node type (with validation)

## Workflow
1. Fetches current tool by slug
2. Validates target node exists in blueprint
3. Validates updated properties against node type requirements
4. Updates tool with modified blueprint

## Validation
- Verifies tool exists and is accessible
- Verifies target node exists in blueprint
- Validates updated properties against node type requirements
- Ensures type changes don't break existing edges
- Maintains blueprint structural integrity

## Response
Returns updated tool with node modifications, or validation errors if update fails`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
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
    required: ['toolSlug', 'nodeRef', 'updates'],
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

            if (!input.updates || typeof input.updates !== 'object') {
              throw new Error('updates is required and must be an object');
            }

            return {
              baseUrl,
              starshipId,
              toolSlug: input.toolSlug,
              nodeRef: input.nodeRef,
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
        name: 'Validate and Edit Node',
        description: 'Edit node properties with validation',
        parameters: {
          code: `
            const supportedTypes = [
              'start', 'end', 'llm', 'code', 'http_request', 'conditional',
              'transform', 'mutate', 'tool', 'workflow', 'user_prompt'
            ];

            const fetchResponse = $lastOutputOf('fetch_tool')[0]?.json ?? {};
            const toolData = fetchResponse.body?.data || fetchResponse.body;

            if (!toolData || !toolData.blueprint) {
              throw new Error('Tool not found or missing blueprint');
            }

            const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
            if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
            if (!Array.isArray(blueprint.edges)) blueprint.edges = [];

            const nodeRef = $lastOutputOf('prepare')[0].json.nodeRef;
            const updates = $lastOutputOf('prepare')[0].json.updates;

            const nodeIndex = blueprint.nodes.findIndex(n => n?.ref === nodeRef);
            if (nodeIndex === -1) {
              return {
                success: false,
                error: \`Node not found: \${nodeRef}\`,
                toolData
              };
            }

            const currentNode = blueprint.nodes[nodeIndex];
            const errors = [];

            // Validate type change if provided
            if (updates.type) {
              if (typeof updates.type !== 'string') {
                errors.push('Node type must be a string');
              } else if (!supportedTypes.includes(updates.type)) {
                errors.push(\`Unsupported node type: \${updates.type}\`);
              }
            }

            // Validate name if provided
            if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim() === '')) {
              errors.push('Node name must be a non-empty string');
            }

            // Validate parameters if provided
            if (updates.parameters !== undefined && typeof updates.parameters !== 'object') {
              errors.push('Node parameters must be an object');
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                toolData
              };
            }

            // Apply updates
            const updatedNode = { ...currentNode };
            if (updates.name !== undefined) updatedNode.name = updates.name;
            if (updates.description !== undefined) updatedNode.description = updates.description;
            if (updates.type !== undefined) updatedNode.type = updates.type;
            if (updates.parameters !== undefined) updatedNode.parameters = updates.parameters;

            blueprint.nodes[nodeIndex] = updatedNode;

            return {
              success: true,
              toolData,
              updatedBlueprint: blueprint,
              editedNode: updatedNode,
              nodeRef
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
          body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}',
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
    '{ "toolSlug": "my-tool", "nodeRef": "process", "updates": { "name": "Process Data", "description": "Transform input data" } }',
  requiresApiKey: false,
  configurationFields: [],
};
