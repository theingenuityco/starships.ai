import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Edit Tool Blueprint Node
 * Modifies properties of an existing node in a blueprint
 */
export const blueprintEditNodeTool: ToolParams = {
  name: 'Edit Tool Blueprint Node',
  slug: 'edit-tool-blueprint-node',
  description: `Modifies properties of an existing node in a tool's blueprint with validation and structural integrity checks.
`,
  parameters: {
    type: 'object',
    properties: {
      toolSlug: { type: 'string', description: 'Slug of the tool to modify' },
      nodeRef: { type: 'string', description: 'Reference of the node to edit' },
      updates: { type: 'object', description: 'Properties to update on the node' },
    },
    required: ['toolSlug', 'nodeRef', 'updates'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'prepare', type: 'code', name: 'Prepare Request', description: 'Build URL, headers and validate inputs', parameters: { code: `
            async function main(ctx) {
              const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\\/+$/, '');
              if (!baseUrl) throw new Error('BASE_URL is required');
              const authToken = ctx.$env('AUTH_TOKEN');
              const starshipId = ctx.$env('STARSHIP_ID');
              if (!authToken) throw new Error('AUTH_TOKEN is required');
              if (!starshipId) throw new Error('STARSHIP_ID is required');
              if (!ctx.$input.toolSlug) throw new Error('toolSlug is required');
              if (!ctx.$input.nodeRef || typeof ctx.$input.nodeRef !== 'string') throw new Error('nodeRef is required and must be a string');
              if (!ctx.$input.updates || typeof ctx.$input.updates !== 'object') throw new Error('updates is required and must be an object');
              return { baseUrl, starshipId, toolSlug: ctx.$input.toolSlug, nodeRef: ctx.$input.nodeRef, updates: ctx.$input.updates, headers: { 'Authorization': \`Bearer \${authToken}\`, 'Content-Type': 'application/json' } };
            }
          `, timeout: 3000 } },
      { ref: 'fetch_tool', type: 'http_request', name: 'Fetch Current Tool', description: 'GET /starships/:starshipId/tools/:toolSlug', parameters: { url: '{{ $lastOutputOf("prepare")[0].json.baseUrl + "/starships/" + $lastOutputOf("prepare")[0].json.starshipId + "/tools/" + $lastOutputOf("prepare")[0].json.toolSlug }}', method: 'GET', headers: '{{ $lastOutputOf("prepare")[0].json.headers }}', timeout: 5000 } },
      { ref: 'validate', type: 'code', name: 'Validate and Edit Node', description: 'Edit node properties with validation', parameters: { code: `
            async function main(ctx) {
              const supportedTypes = ['start','end','llm','code','http_request','conditional','transform','mutate','tool','workflow','user_prompt'];
              const fetchResponse = ctx.$lastOutputOf('fetch_tool')[0]?.json ?? {};
              const toolData = fetchResponse.body?.data || fetchResponse.body;
              if (!toolData || !toolData.blueprint) throw new Error('Tool not found or missing blueprint');
              const blueprint = JSON.parse(JSON.stringify(toolData.blueprint));
              if (!Array.isArray(blueprint.nodes)) blueprint.nodes = [];
              if (!Array.isArray(blueprint.edges)) blueprint.edges = [];
              const nodeRef = ctx.$lastOutputOf('prepare')[0].json.nodeRef;
              const updates = ctx.$lastOutputOf('prepare')[0].json.updates;
              const nodeIndex = blueprint.nodes.findIndex((n: any) => n?.ref === nodeRef);
              if (nodeIndex === -1) return { success: false, error: \`Node not found: \${nodeRef}\`, toolData };
              const currentNode = blueprint.nodes[nodeIndex];
              const errors: string[] = [];
              if (updates.type) { if (typeof updates.type !== 'string') errors.push('Node type must be a string'); else if (!supportedTypes.includes(updates.type)) errors.push(\`Unsupported node type: \${updates.type}\`); }
              if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim() === '')) errors.push('Node name must be a non-empty string');
              if (updates.parameters !== undefined && typeof updates.parameters !== 'object') errors.push('Node parameters must be an object');
              if (errors.length > 0) return { success: false, errors, toolData };
              const updatedNode = { ...currentNode };
              if (updates.name !== undefined) updatedNode.name = updates.name;
              if (updates.description !== undefined) updatedNode.description = updates.description;
              if (updates.type !== undefined) updatedNode.type = updates.type;
              if (updates.parameters !== undefined) updatedNode.parameters = updates.parameters;
              blueprint.nodes[nodeIndex] = updatedNode;
              return { success: true, toolData, updatedBlueprint: blueprint, editedNode: updatedNode, nodeRef };
            }
          `, timeout: 3000 } },
      { ref: 'update_tool', type: 'http_request', name: 'Update Tool with Modified Blueprint', description: 'PUT /tools/:id with updated blueprint', parameters: { url: '{{ $lastOutputOf("validate")[0].json.toolData.id ? $lastOutputOf("prepare")[0].json.baseUrl + "/tools/" + $lastOutputOf("validate")[0].json.toolData.id : "" }}', method: 'PUT', headers: '{{ $lastOutputOf("prepare")[0].json.headers }}', body: '{{ (() => { const result = $lastOutputOf("validate")[0].json; return result.success ? { blueprint: result.updatedBlueprint } : {}; })() }}', timeout: 10000 } },
      { ref: 'end_1', type: 'end', name: 'End', description: 'Return updated tool or validation errors', parameters: { output: '{{ $lastOutputOf("update_tool")[0].json }}' } },
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

export const toolEditBlueprintNodeToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintEditNodeTool.name,
  description: blueprintEditNodeTool.description,
  parameters: blueprintEditNodeTool.parameters,
  blueprint: blueprintEditNodeTool.blueprint,

  slug: 'edit-tool-blueprint-node',
  category: 'automation',
  exampleUsage: '{ "toolSlug": "my-tool", "nodeRef": "process", "updates": { "name": "Process Data" } }',
  requiresApiKey: false,
  configurationFields: [],
};


