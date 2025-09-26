import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: node_schema
 * Provides comprehensive schema information for Autopilot node types
 */
export const nodeSchemaIntrospectionTool: ToolParams = {
  name: 'node_schema',
  description: `Query detailed schema information for Autopilot node types including parameters, validation rules, and execution behavior.

## Purpose
Provides real-time, accurate schema information for all Autopilot node types, including complex nested structures, validation requirements, and execution patterns.

## Query Capabilities
- **Specific Node Type**: Get complete schema for a single node type
- **All Node Types**: List all available node types with descriptions
- **Parameter Details**: Deep dive into parameter schemas including nested structures
- **Validation Rules**: Understand validation requirements and constraints
- **Execution Patterns**: Learn how nodes execute and interact

## Node Types Available
start, end, llm, agent, http_request, conditional, transform, mutate, tool, workflow, code, user_prompt

## Response Format
Returns comprehensive schema with:
- Parameter definitions with types and constraints
- Required vs optional fields
- Validation rules and ranges
- Template expression support
- Inline operation capabilities
- Execution behavior notes`,
  parameters: {
    type: 'object',
    properties: {
      nodeType: {
        type: 'string',
        enum: [
          'all', // List all node types
          'start',
          'end',
          'llm',
          'agent',
          'http_request',
          'conditional',
          'transform',
          'mutate',
          'tool',
          'workflow',
          'code',
          'user_prompt',
        ],
        description: 'Node type to query schema for, or "all" to list all types',
      },
      detail: {
        type: 'string',
        enum: ['summary', 'full', 'examples'],
        description: 'Level of detail in the response',
      },
    },
    required: ['nodeType'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'fetch_schema',
        type: 'code',
        name: 'Fetch Node Schema',
        description: 'Return comprehensive node schema information',
        parameters: {
          code: `
            const nodeType = input.nodeType || 'all';
            const detail = input.detail || 'full';
            
            // Comprehensive node schemas based on actual autopilot implementation
            const schemas = {
              start: {
                type: 'start',
                description: 'Entry point of workflow execution',
                parameters: {},
                behavior: {
                  input: 'Receives initial input from __initial__ synthetic result if available',
                  output: 'Passes input through unchanged to downstream nodes',
                  execution: 'Always executes first in the workflow'
                },
                validation: 'None required - accepts any parameters',
                examples: [
                  { ref: 'start_1', type: 'start', name: 'Begin Workflow', parameters: {} }
                ]
              },
              end: {
                type: 'end',
                description: 'Workflow termination point with optional output transformation',
                parameters: {
                  output: {
                    type: 'any',
                    required: false,
                    description: 'Optional output value. Supports {{ expression }} template expressions. When set, Engine returns this as final workflow result wrapped in ExecutionItem[]'
                  }
                },
                behavior: {
                  input: 'Any ExecutionItem[] from previous node (ignored)',
                  output: 'If output parameter set, returns { result: resolvedValue }; otherwise returns empty object',
                  execution: 'Marks workflow completion'
                },
                validation: 'Output parameter can be any type or template expression',
                examples: [
                  { ref: 'end_1', type: 'end', name: 'Complete', parameters: {} },
                  { ref: 'end_1', type: 'end', name: 'Return Result', parameters: { output: '{{ $lastOutputOf("process")[0].json.data }}' } }
                ]
              },
              llm: {
                type: 'llm',
                description: 'Large Language Model API call via OpenRouter with streaming support',
                parameters: {
                  model: {
                    type: 'string',
                    required: true,
                    description: 'Model identifier (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4-turbo)',
                    examples: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo', 'google/gemini-pro-1.5']
                  },
                  messages: {
                    type: 'array | string',
                    required: true,
                    description: 'Chat messages array [{role, content}] or template string that resolves to messages',
                    schema: {
                      role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
                      content: { type: 'string' },
                      tool_call_id: { type: 'string', required: false, description: 'For tool role messages' },
                      tool_calls: { type: 'array', required: false, description: 'Function calls made by assistant' }
                    }
                  },
                  temperature: {
                    type: 'number | string',
                    range: '0-2',
                    default: 0.7,
                    description: 'Controls randomness. Supports template expressions'
                  },
                  maxTokens: {
                    type: 'number | string',
                    minimum: 1,
                    default: 1024,
                    description: 'Maximum response tokens. Supports template expressions'
                  },
                  timeout: {
                    type: 'number | string',
                    minimum: 1000,
                    description: 'Request timeout in milliseconds'
                  },
                  topP: {
                    type: 'number | string',
                    range: '0-1',
                    default: 1.0,
                    description: 'Nucleus sampling parameter'
                  },
                  frequencyPenalty: {
                    type: 'number | string',
                    range: '-2 to 2',
                    default: 0,
                    description: 'Penalty for token frequency'
                  },
                  presencePenalty: {
                    type: 'number | string',
                    range: '-2 to 2',
                    default: 0,
                    description: 'Penalty for token presence'
                  },
                  tools: {
                    type: 'ToolParams[] | string',
                    required: false,
                    description: 'Function calling tools in OpenAI format or template expression',
                    schema: 'Array of ToolParams with name, description, parameters (JSON Schema), blueprint'
                  },
                  reasoning: {
                    type: 'object',
                    required: false,
                    description: 'OpenRouter unified reasoning configuration',
                    properties: {
                      effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                      max_tokens: { type: 'number' },
                      exclude: { type: 'boolean' },
                      enabled: { type: 'boolean' }
                    }
                  }
                },
                behavior: {
                  streaming: 'Always enabled for better UX',
                  apiKey: 'Required via env("OPEN_ROUTER_KEY") or autopilot.setCredentials()',
                  output: 'OpenRouter response format with choices[], message.content, message.tool_calls',
                  events: 'Emits content_chunk during streaming, content_complete when done'
                },
                validation: [
                  'Model must be valid OpenRouter model identifier',
                  'Messages must be array or template string',
                  'Temperature/topP/penalties must be within valid ranges',
                  'API key must be configured'
                ],
                inlineOperations: true
              },
              agent: {
                type: 'agent',
                description: 'AI agent with memory management, tool calling, and conversation state',
                parameters: {
                  name: { type: 'string', required: true, description: 'Agent identifier name' },
                  description: { type: 'string', required: false },
                  model: { type: 'string', required: true, description: 'LLM model to use' },
                  temperature: { type: 'number', range: '0-2', default: 0.7 },
                  maxTokens: { type: 'number', minimum: 1, default: 2048 },
                  timeout: { type: 'number', minimum: 1000, description: 'Execution timeout in ms' },
                  systemPrompt: { type: 'string', description: 'System-level instructions for the agent' },
                  state: {
                    type: 'object',
                    description: 'Runtime state containing messages and tools',
                    properties: {
                      messages: {
                        type: 'array',
                        description: 'Conversation history [{role, content, tool_calls?, tool_call_id?}]'
                      },
                      tools: {
                        type: 'array',
                        description: 'Available ToolParams[] for function calling'
                      },
                      starshipId: { type: 'string', description: 'Current starship context' },
                      baseUrl: { type: 'string', description: 'Server API base URL' },
                      authToken: { type: 'string', description: 'JWT authentication token' }
                    }
                  },
                  blueprint: {
                    type: 'Blueprint',
                    required: false,
                    description: 'Custom agent workflow blueprint (auto-generated if not provided)'
                  },
                  metadata: { type: 'object', description: 'Additional agent metadata' }
                },
                behavior: {
                  blueprintGeneration: 'Creates default tool-calling loop if blueprint not provided',
                  toolLoop: 'Start -> LLM -> Conditional(tool_calls?) -> Tool -> Mutate -> LLM (loop)',
                  errorHandling: 'failOnNodeError: false by default for conversation resilience',
                  messageOrdering: 'systemPrompt -> state.messages -> input messages',
                  runner: 'ChildProcessRunner for depth=0, LocalRunner for depth>0'
                },
                validation: [
                  'Name and model are required',
                  'Temperature 0-2, maxTokens >= 1',
                  'Blueprint must have start node if provided'
                ],
                inlineOperations: true
              },
              http_request: {
                type: 'http_request',
                description: 'HTTP/HTTPS API call using native fetch with full RequestInit support',
                parameters: {
                  url: { type: 'string', required: true, description: 'Full URL with protocol' },
                  method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
                    default: 'GET'
                  },
                  headers: {
                    type: 'object | Headers | array',
                    description: 'Request headers as object, Headers instance, or [key,value][] pairs'
                  },
                  body: {
                    type: 'object | string | null',
                    description: 'Request body (not sent for GET/HEAD)'
                  },
                  timeout: { type: 'number', minimum: 1000, default: 30000 },
                  credentials: { type: 'string', enum: ['omit', 'same-origin', 'include'] },
                  mode: { type: 'string', enum: ['cors', 'no-cors', 'same-origin'] },
                  redirect: { type: 'string', enum: ['follow', 'manual', 'error'], default: 'follow' },
                  cache: { type: 'string' },
                  referrer: { type: 'string' },
                  referrerPolicy: { type: 'string' },
                  integrity: { type: 'string' },
                  keepalive: { type: 'boolean' }
                },
                behavior: {
                  input: 'Uses input as body if no explicit body provided',
                  output: '{ status, statusText, headers: object, body: parsed JSON or text, url }',
                  errorHandling: 'Throws on non-2xx status codes',
                  bodyParsing: 'Auto-parses JSON based on content-type header'
                },
                validation: [
                  'URL must be valid with protocol',
                  'Method must be valid HTTP method',
                  'Timeout >= 1000ms'
                ],
                inlineOperations: true
              },
              conditional: {
                type: 'conditional',
                description: 'Evaluates JavaScript expressions for workflow branching',
                parameters: {
                  condition: {
                    type: 'string | any',
                    required: true,
                    description: 'JavaScript expression or value for conditional evaluation'
                  }
                },
                behavior: {
                  input: 'Optional ExecutionItem[] available in expression context',
                  output: '{ result: evaluated value, edgeCondition?: string for routing }',
                  edgeSelection: 'edgeCondition used to match edge.condition for branching',
                  templateSupport: 'Full {{ jsExpression }} support with execution context'
                },
                validation: [
                  'Condition required (can be empty string after template resolution)',
                  'JavaScript syntax validation for template expressions'
                ],
                examples: [
                  { condition: '{{ state.retryCount < 3 }}' },
                  { condition: '{{ $exists($lastOutputOf("api")[0].error) }}' }
                ]
              },
              transform: {
                type: 'transform',
                description: 'Input->output data transformations using JSON Patch operations',
                parameters: {
                  transforms: {
                    type: 'array',
                    required: true,
                    description: 'Array of TransformOperation for data transformation',
                    schema: {
                      operation: { 
                        type: 'string',
                        enum: ['add', 'replace', 'remove', 'copy', 'move', 'test']
                      },
                      path: { type: 'string', description: 'JSON Pointer path (e.g., /field/subfield)' },
                      value: { type: 'any', description: 'Value to apply (supports templates)' },
                      from: { type: 'string', description: 'Source path for copy/move operations' }
                    }
                  }
                },
                behavior: {
                  input: 'REQUIRED - transforms apply to input data',
                  output: 'Transformed input data as single ExecutionItem',
                  execution: 'Sequential application - each operation sees previous results',
                  scope: 'Input data only - use Mutate for state changes'
                },
                validation: [
                  'At least one transform operation required',
                  'Input data required for transformation',
                  'Valid JSON Pointer paths',
                  'from required for copy/move operations'
                ]
              },
              mutate: {
                type: 'mutate',
                description: 'Execution state mutations using JSON Patch operations',
                parameters: {
                  mutations: {
                    type: 'array',
                    required: true,
                    description: 'Array of TransformOperation for state mutation',
                    schema: {
                      operation: {
                        type: 'string',
                        enum: ['add', 'replace', 'remove', 'copy', 'move', 'test']
                      },
                      path: {
                        type: 'string',
                        description: 'JSON Pointer path starting with /state'
                      },
                      value: { type: 'any', description: 'Value to apply (pre-resolved by Engine)' },
                      from: { type: 'string', description: 'Source path (must start with /state)' }
                    }
                  }
                },
                behavior: {
                  input: 'Ignored - operates on execution.state directly',
                  output: '{ mutationsApplied: count, operations: string[] }',
                  safety: 'Creates snapshot, validates changes, can rollback on error',
                  pathCreation: 'Auto-creates intermediate paths for add operations'
                },
                validation: [
                  'At least one mutation required',
                  'All paths must start with /state',
                  'State must remain valid object after mutations'
                ]
              },
              tool: {
                type: 'tool',
                description: 'Function execution node for tool calling with nested blueprint execution',
                parameters: {
                  name: { type: 'string', required: true, description: 'Tool name' },
                  description: { type: 'string', required: true, description: 'Tool description' },
                  parameters: {
                    type: 'object',
                    required: true,
                    description: 'JSON Schema for tool input parameters',
                    properties: {
                      type: { constant: 'object' },
                      properties: { type: 'object', description: 'Parameter definitions' },
                      required: { type: 'array', description: 'Required parameter names' }
                    }
                  },
                  blueprint: {
                    type: 'Blueprint',
                    required: true,
                    description: 'Workflow blueprint that implements the tool logic'
                  },
                  toolCallId: {
                    type: 'string',
                    description: 'ID linking to originating assistant tool_call'
                  }
                },
                behavior: {
                  input: 'Plain object with tool arguments (pre-parsed by LLM/Agent)',
                  output: 'Result from blueprint execution or error with details',
                  execution: 'Runs blueprint with depth+1, ChildProcessRunner at depth=0',
                  events: 'Emits tool_started and tool_complete with result or error',
                  errorHandling: 'Returns { ok: false, error, details } on failure'
                },
                validation: [
                  'Name, description, and blueprint required',
                  'Parameters must be object type with properties',
                  'Blueprint must contain start node',
                  'Input must be plain object'
                ]
              },
              workflow: {
                type: 'workflow',
                description: 'Nested workflow execution with embedded blueprint',
                parameters: {
                  name: { type: 'string', required: true },
                  description: { type: 'string' },
                  timeout: { type: 'number', minimum: 1000 },
                  blueprint: {
                    type: 'Blueprint',
                    required: true,
                    description: 'Complete workflow blueprint to execute'
                  },
                  metadata: { type: 'object' }
                },
                behavior: {
                  input: 'Passed to nested workflow as initial input',
                  output: 'Result from nested workflow execution',
                  execution: 'Creates new execution context with depth+1',
                  runner: 'ChildProcessRunner at depth=0, LocalRunner at depth>0',
                  inheritance: 'Inherits parent execution context and secureEnv'
                },
                validation: [
                  'Blueprint required with nodes[] and edges[]',
                  'Must have start node',
                  'Valid edge references'
                ],
                inlineOperations: true
              },
              code: {
                type: 'code',
                description: 'JavaScript code execution in controlled sandbox',
                parameters: {
                  code: { type: 'string', required: true, description: 'JavaScript code to execute' },
                  timeout: { type: 'number', minimum: 100, default: 5000 }
                },
                context: {
                  available: [
                    'input - Input data',
                    '$input() - Input accessor function',
                    '$lastOutputOf(nodeRef) - Get node output',
                    'state - Execution state',
                    'env(key) - Environment variable',
                    'envAll() - All environment variables',
                    'console.log/warn/error - Logging',
                    'JSON, Math, Date - Utilities'
                  ],
                  forbidden: ['setTimeout', 'setInterval', 'require', 'process', 'global', 'eval', 'Function']
                },
                behavior: {
                  input: 'Available as input and $input() in code context',
                  output: 'Return value from code execution',
                  async: 'Supports async/await and promises',
                  sanitization: 'Non-finite numbers converted to strings'
                },
                validation: [
                  'Code syntax validation',
                  'Security pattern checks',
                  'Timeout >= 100ms'
                ],
                inlineOperations: true
              },
              user_prompt: {
                type: 'user_prompt',
                description: 'User interaction point for workflow input (platform-specific implementation)',
                parameters: {
                  promptText: { type: 'string', required: true },
                  choices: {
                    type: 'array',
                    required: true,
                    schema: {
                      id: { type: 'string', required: true },
                      text: { type: 'string', required: true },
                      description: { type: 'string' },
                      value: { type: 'any', required: true }
                    }
                  },
                  sourceNodeId: { type: 'string' },
                  timeout: { type: 'number', default: 3600000 },
                  required: { type: 'boolean', default: true }
                },
                behavior: {
                  input: 'Ignored',
                  output: '{ message: { role: "user", content: selected choice text } }',
                  implementation: 'Platform-specific - requires UI integration'
                },
                validation: [
                  'promptText required',
                  'At least one choice required'
                ]
              }
            };
            
            // Special handling for inline operations
            const inlineOperations = {
              description: 'Any node can include inline operations for processing',
              parameters: {
                transforms: {
                  type: 'TransformOperation[]',
                  description: 'Input transformations - runs AFTER main handler on output'
                },
                mutations: {
                  type: 'TransformOperation[]', 
                  description: 'State mutations - runs AFTER transforms'
                },
                condition: {
                  type: 'string',
                  description: 'Conditional expression - evaluated AFTER mutations for edge routing'
                }
              },
              execution: 'Handler -> inline transforms -> inline mutations -> inline condition',
              note: 'Dedicated transform/mutate/conditional nodes skip their inline counterparts'
            };
            
            // Build response based on query
            if (nodeType === 'all') {
              const summary = Object.entries(schemas).map(([type, schema]) => ({
                type,
                description: schema.description,
                hasRequiredParams: Object.keys(schema.parameters || {}).some(
                  key => schema.parameters[key]?.required
                ),
                supportsInlineOps: schema.inlineOperations ?? false
              }));
              
              return {
                nodeTypes: summary,
                totalTypes: summary.length,
                inlineOperations,
                templateSupport: 'All string parameters support {{ jsExpression }} templates'
              };
            }
            
            const schema = schemas[nodeType];
            if (!schema) {
              return { error: \`Unknown node type: \${nodeType}\` };
            }
            
            if (detail === 'summary') {
              return {
                type: schema.type,
                description: schema.description,
                requiredParams: Object.entries(schema.parameters || {})
                  .filter(([_, p]) => p.required)
                  .map(([name]) => name),
                supportsInlineOps: schema.inlineOperations ?? false
              };
            }
            
            if (detail === 'examples') {
              return {
                type: schema.type,
                examples: schema.examples || [],
                validation: schema.validation
              };
            }
            
            // Full detail
            const response = { ...schema };
            if (schema.inlineOperations) {
              response.inlineOperations = inlineOperations;
            }
            
            return response;
          `,
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("fetch_schema")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'fetch_schema' },
      { ref: 'e2', from: 'fetch_schema', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: node_schema
 */
export const nodeSchemaIntrospectionToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: nodeSchemaIntrospectionTool.name,
  description: nodeSchemaIntrospectionTool.description,
  parameters: nodeSchemaIntrospectionTool.parameters,
  blueprint: nodeSchemaIntrospectionTool.blueprint,

  slug: 'node-schema',
  category: 'automation',
  exampleUsage: '{ "nodeType": "llm", "detail": "full" } // returns complete LLM node schema',
  requiresApiKey: false,
  configurationFields: [],
};
