import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: tool_create
 * Create a new Tool instance on a starship via server REST API
 */
export const toolCreateTool: ToolParams = {
  name: 'tool_create',
  description: `Creates a new Tool instance on the current starship with full blueprint validation and configuration.

## Purpose
Creates executable tools that can be invoked by agents, with complete Autopilot workflow blueprints that define their behavior.

## Required Parameters
- **name**: Human-readable tool name (e.g., "Weather Lookup", "Send Email")
- **slug**: Unique kebab-case identifier (e.g., "weather-lookup", "send-email") 
- **description**: Clear description of tool functionality and usage
- **parameters**: JSON Schema defining tool input structure with validation rules
- **blueprint**: Complete Autopilot workflow blueprint with nodes, edges, and execution logic

## Optional Parameters
- **configuration**: Instance-specific settings (endpoints, flags, timeouts)
- **isEnabled**: Tool availability status (default: true)

## Blueprint Requirements
Blueprints must follow Autopilot structure:
- **nodes[]**: Array of workflow nodes (start, end, llm, code, http_request, etc.)
- **edges[]**: Array of connections defining execution flow
- **metadata**: Optional blueprint metadata and configuration

## Template Expression Support
Blueprints support \`{{ jsExpression }}\` syntax for dynamic evaluation:
- **Context Variables**: \`state\`, \`input\`, \`outputs\`, \`status\`
- **Helper Functions**: \`$lastOutputOf(nodeRef)\`, \`$input(path)\`, \`env(key)\`
- **Examples**: \`{{ $json.apiKey }}\`, \`{{ $lastOutputOf("http_1")[0].json }}\`

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token  
- **STARSHIP_ID**: Current starship identifier

## Validation & Constraints
- Blueprint structure validated for basic shape (use blueprint_lint for comprehensive validation)
- No secrets allowed in parameters or blueprint
- Slug must be unique per starship (409 error on collision)

## Response & Behavior
- **Output**: Complete tool model from POST /starships/:starshipId/tools
- **Timeouts**: Preparation (3s), HTTP request (10s)
- **Not idempotent**: Retries may create duplicates unless slug unchanged
- **Common failures**: Missing environment, invalid blueprint, validation errors`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable tool name (e.g., "Weather Lookup", "Send Email", "Calculate Math")',
      },
      slug: {
        type: 'string',
        description:
          'Unique kebab-case identifier for the tool (e.g., "weather-lookup", "send-email", "calculate-math"). Must match pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$',
      },
      description: {
        type: 'string',
        description: 'Clear description of tool functionality and usage (minimum 10 characters, maximum 500 characters)',
      },
      parameters: {
        type: 'object',
        description:
          'JSON Schema defining the tool input structure and validation rules. Must have "type": "object" and "properties" defining input parameters. Each property supports type (string|number|boolean|object|array), description, enum for validation. Arrays use "items", objects use "properties". Example: { "type": "object", "properties": { "location": { "type": "string", "description": "City name" }, "units": { "type": "string", "enum": ["metric", "imperial"], "description": "Temperature units" } }, "required": ["location"] }',
      },
      blueprint: {
        type: 'object',
        description:
          'Complete Autopilot workflow blueprint defining tool execution logic. Must contain "nodes" array and "edges" array. Nodes have required fields: ref (unique ID), type (start|end|llm|code|http_request|conditional|transform|mutate|tool|agent|workflow|user_prompt), name, description, parameters. Edges have required fields: ref, from (source node ref), to (target node ref), optional condition. Supports template expressions {{ jsExpression }} in parameters for dynamic evaluation using context variables (state, input, outputs, status) and helper functions ($lastOutputOf, $input, env). Common node types: start/end (flow control), llm (AI models with model/messages/temperature), http_request (API calls with url/method/headers/body), code (JavaScript execution), conditional (branching logic), transform/mutate (data operations), tool (nested tools), agent (AI agents), workflow (sub-workflows). Metadata is optional for versioning and documentation.',
      },
      configuration: {
        type: 'object',
        description:
          'Optional instance-specific configuration settings including endpoints (object with string values), timeouts (object with default/http/llm integer values), retries (object with maxAttempts/backoffMs), and feature flags (object with boolean values)',
      },
      isEnabled: {
        type: 'boolean',
        description: 'Whether the tool is available for use after creation (default: true)',
      },
    },
    required: ['name', 'slug', 'description', 'parameters', 'blueprint'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build URL, headers and body',
        parameters: {
          code: `
            const baseUrl = (env('BASE_URL') || '').replace(/\\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = env('AUTH_TOKEN');
            const starshipId = env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            const required = ['name', 'slug', 'description', 'parameters', 'blueprint'];
            for (const k of required) {
              if (input[k] === undefined || input[k] === null) {
                throw new Error(\`\${k} is required\`);
              }
            }

            // Validate blueprint shape strictly; do not normalize
            if (
              !input.blueprint ||
              typeof input.blueprint !== 'object' ||
              !Array.isArray(input.blueprint.nodes) ||
              !Array.isArray(input.blueprint.edges)
            ) {
              throw new Error('Invalid blueprint: nodes and edges must be arrays');
            }

            const body = {
              name: input.name,
              slug: input.slug,
              description: input.description,
              parameters: input.parameters,
              blueprint: input.blueprint,
              configuration: input.configuration ?? {},
              isEnabled: input.isEnabled ?? true,
            };

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/tools\`,
              method: 'POST',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              },
              body
            };
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_create',
        type: 'http_request',
        name: 'Create Tool',
        description: 'POST /starships/:starshipId/tools',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare")[0].json.body }}',
          timeout: 10000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("http_create")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_create' },
      { ref: 'e3', from: 'http_create', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: tool_create
 */
export const toolCreateToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: toolCreateTool.name,
  description: toolCreateTool.description,
  parameters: toolCreateTool.parameters,
  blueprint: toolCreateTool.blueprint,

  slug: 'tool-create',
  category: 'automation',
  exampleUsage:
    '{ "name": "...", "slug": "...", "description": "...", "parameters": {...}, "blueprint": {...} } // env inferred (baseUrl, authToken, starshipId)',
  requiresApiKey: false,
  configurationFields: [],
};
