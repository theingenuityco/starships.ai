import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Add Tool Blueprint Node
 * Adds a new node to an existing tool's blueprint with validation
 */
export const toolAddBlueprintNodeTool: ToolParams = {
  name: 'Add Tool Blueprint Node',
  slug: 'tool-add-blueprint-node',
  description: `Adds a new node to an existing tool's blueprint with automatic validation and conflict detection.

## Purpose
Incrementally build tool blueprints by adding nodes one at a time, ensuring each addition maintains blueprint integrity.

## Required Parameters
- **toolSlug**: Slug of the tool to modify
- **node**: New node to add with ref, type, name, description, parameters

## Node Requirements
- **ref**: Unique identifier (string)
- **type**: Valid node type (start, end, llm, code, http_request, conditional, transform, mutate, tool, workflow, user_prompt)
- **name**: Human-readable name
- **description**: Optional description
- **parameters**: Node-specific parameters object. Use node-schema tool to get the exact structure for each node type.

## Workflow
1. Fetches current tool by slug
2. Validates new node structure and uniqueness
3. Adds node to tool's blueprint
4. Updates tool with modified blueprint

## Validation
- Verifies tool exists and is accessible
- Checks for ref uniqueness within blueprint
- Validates node type against supported types
- Ensures required node fields are present
- Maintains blueprint structural integrity

## Response
Returns updated tool with new node in blueprint, or validation errors if addition fails`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: {
        type: 'string',
        description: 'Slug of the tool to modify',
      },
      node: {
        type: 'object',
        description: 'Node to add to tool blueprint',
        properties: {
          ref: { type: 'string', description: 'Unique node identifier' },
          type: { type: 'string', description: 'Node type' },
          name: { type: 'string', description: 'Node name' },
          description: { type: 'string', description: 'Node description' },
          parameters: {
            type: 'object',
            description: 'Node-specific parameters object. Structure varies by node type. Use node-schema tool for exact requirements.',
          },
        },
      },
    },
    required: ['toolSlug', 'node'],
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

            if (!input.node || typeof input.node !== 'object') {
              throw new Error('node is required and must be an object');
            }

            return {
              baseUrl,
              starshipId,
              toolSlug: input.toolSlug,
              node: input.node,
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
        ref: 'validate_node',
        type: 'code',
        name: 'Validate and Add Node',
        description: 'Validate node and add to blueprint',
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

            const newNode = $lastOutputOf('prepare')[0].json.node;
            const errors = [];

            // Validate node structure
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

            // Check for ref conflicts
            const existingRefs = new Set(blueprint.nodes.map(n => n?.ref).filter(Boolean));
            if (existingRefs.has(newNode.ref)) {
              errors.push(\`Node ref already exists: \${newNode.ref}\`);
            }

            if (errors.length > 0) {
              return {
                success: false,
                errors,
                toolData
              };
            }

            // Add the node
            blueprint.nodes.push(newNode);

            return {
              success: true,
              toolData,
              updatedBlueprint: blueprint,
              addedNode: newNode,
              nodeCount: blueprint.nodes.length
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'update_tool',
        type: 'http_request',
        name: 'Update Tool with New Blueprint',
        description: 'PUT /tools/:id with updated blueprint',
        parameters: {
          url: '{{ $lastOutputOf("validate_node")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate_node")[0].json.toolData.id : "" }}',
          method: 'PUT',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ (() => { const result = $lastOutputOf("validate_node")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}',
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
      { ref: 'e3', from: 'fetch_tool', to: 'validate_node' },
      { ref: 'e4', from: 'validate_node', to: 'update_tool' },
      { ref: 'e5', from: 'update_tool', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool-add-blueprint-node
 */
export const toolAddBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolAddBlueprintNodeTool.name,
  description: toolAddBlueprintNodeTool.description,
  parameters: toolAddBlueprintNodeTool.parameters,
  blueprint: toolAddBlueprintNodeTool.blueprint,

  slug: 'tool-add-blueprint-node',
  category: 'automation',
  exampleUsage:
    '{ "toolSlug": "my-tool", "node": { "ref": "process", "type": "code", "name": "Process Data", "parameters": { "code": "return input;" } } }',
  requiresApiKey: false,
  configurationFields: [],
};
