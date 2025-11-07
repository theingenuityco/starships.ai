import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';

const router: Router = Router();

// ----------------------------------------------------------------------------
// Zod schemas
// ----------------------------------------------------------------------------

const DocsQuerySchema = z
  .object({
    topic: z.enum(['node-schema', 'blueprint-examples']),
    // node-schema params
    nodeType: z
      .enum([
        'all',
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
      ])
      .optional(),
    detail: z.enum(['summary', 'full', 'examples']).optional(),
    // blueprint-examples params
    category: z
      .enum(['basic', 'conditional', 'loops', 'api_integration', 'llm_patterns', 'error_handling', 'state_management', 'nested', 'all'])
      .optional(),
    pattern: z.string().optional(),
  })
  .refine(
    (q) => {
      if (q.topic === 'node-schema') {
        return typeof q.nodeType === 'string';
      }
      if (q.topic === 'blueprint-examples') {
        return typeof q.category === 'string';
      }
      return false;
    },
    { message: 'Missing required parameters for selected topic' }
  );

// ----------------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------------

router.get('/docs', (req: Request, res: Response): void => {
  const query = validateData(DocsQuerySchema, req.query, res, 'docs query');
  if (!query) return;

  try {
    if (query.topic === 'node-schema') {
      const data = getNodeSchemaResponse(query.nodeType as string, (query.detail as any) ?? 'full');
      sendSuccess(res, data);
      return;
    }

    if (query.topic === 'blueprint-examples') {
      const data = getBlueprintExamplesResponse(query.category as string, query.pattern);
      sendSuccess(res, data);
      return;
    }

    sendError(res, 'VALIDATION_ERROR', 'Unsupported topic', 400);
  } catch (error) {
    console.error('[DOCS] Error generating docs response:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate docs', 500);
  }
});

// ----------------------------------------------------------------------------
// Implementation (verbatim logic migrated from tool code nodes)
// ----------------------------------------------------------------------------

function getNodeSchemaResponse(nodeType: string, detail: 'summary' | 'full' | 'examples') {
  const schemas: Record<string, any> = {
    start: {
      type: 'start',
      description: 'Entry point of workflow execution',
      parameters: {},
      behavior: {
        input: 'Receives initial input from __initial__ synthetic result if available',
        output: 'Passes input through unchanged to downstream nodes',
        execution: 'Always executes first in the workflow',
      },
      validation: 'None required - accepts any parameters',
      examples: [{ ref: 'start_1', type: 'start', name: 'Begin Workflow', parameters: {} }],
    },
    end: {
      type: 'end',
      description: 'Workflow termination point with optional output transformation',
      parameters: {
        output: {
          type: 'any',
          required: false,
          description:
            'Optional output value. Supports {{ expression }} template expressions. When set, Engine returns this as final workflow result wrapped in ExecutionItem[]',
        },
      },
      behavior: {
        input: 'Any ExecutionItem[] from previous node (ignored)',
        output:
          'If output parameter set, returns { result: resolvedValue }; otherwise returns empty object',
        execution: 'Marks workflow completion',
      },
      validation: 'Output parameter can be any type or template expression',
      examples: [
        { ref: 'end_1', type: 'end', name: 'Complete', parameters: {} },
        {
          ref: 'end_1',
          type: 'end',
          name: 'Return Result',
          parameters: { output: '{{ $lastOutputOf("process")[0].json.data }}' },
        },
      ],
    },
    llm: {
      type: 'llm',
      description: 'Large Language Model API call via OpenRouter with streaming support',
      parameters: {
        model: {
          type: 'string',
          required: true,
          description:
            'Model identifier (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4-turbo)',
          examples: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo', 'google/gemini-pro-1.5'],
        },
        messages: {
          type: 'array | string',
          required: true,
          description:
            'Chat messages array [{role, content}] or template string that resolves to messages',
          schema: {
            role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
            content: { type: 'string' },
            toolCallId: { type: 'string', required: false, description: 'For tool role messages' },
            toolCalls: { type: 'array', required: false, description: 'Function calls made by assistant' },
          },
        },
        temperature: {
          type: 'number | string',
          range: '0-2',
          default: 0.7,
          description: 'Controls randomness. Supports template expressions',
        },
        maxTokens: {
          type: 'number | string',
          minimum: 1,
          default: 1024,
          description: 'Maximum response tokens. Supports template expressions',
        },
        timeout: { type: 'number | string', minimum: 1000, description: 'Request timeout in milliseconds' },
        topP: { type: 'number | string', range: '0-1', default: 1.0, description: 'Nucleus sampling parameter' },
        frequencyPenalty: {
          type: 'number | string',
          range: '-2 to 2',
          default: 0,
          description: 'Penalty for token frequency',
        },
        presencePenalty: {
          type: 'number | string',
          range: '-2 to 2',
          default: 0,
          description: 'Penalty for token presence',
        },
        tools: {
          type: 'ToolParams[] | string',
          required: false,
          description: 'Function calling tools in OpenAI format or template expression',
          schema: 'Array of ToolParams with name, description, parameters (JSON Schema), blueprint',
        },
        reasoning: {
          type: 'object',
          required: false,
          description: 'OpenRouter unified reasoning configuration',
          properties: {
            effort: { type: 'string', enum: ['low', 'medium', 'high'] },
            max_tokens: { type: 'number' },
            exclude: { type: 'boolean' },
            enabled: { type: 'boolean' },
          },
        },
      },
      behavior: {
        streaming: 'Always enabled for better UX',
        apiKey: 'Required via env("OPEN_ROUTER_KEY") or autopilot.setCredentials()',
        output: 'OpenRouter response format with choices[], message.content, message.toolCalls',
        events: 'Emits content_chunk during streaming, content_complete when done',
      },
      validation: [
        'Model must be valid OpenRouter model identifier',
        'Messages must be array or template string',
        'Temperature/topP/penalties must be within valid ranges',
        'API key must be configured',
      ],
      inlineOperations: true,
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
              description: 'Conversation history [{role, content, toolCalls?, toolCallId?}]',
            },
            tools: { type: 'array', description: 'Available ToolParams[] for function calling' },
            starshipId: { type: 'string', description: 'Current starship context' },
            baseUrl: { type: 'string', description: 'Server API base URL' },
            authToken: { type: 'string', description: 'JWT authentication token' },
          },
        },
        blueprint: {
          type: 'Blueprint',
          required: false,
          description: 'Custom agent workflow blueprint (auto-generated if not provided)',
        },
        metadata: { type: 'object', description: 'Additional agent metadata' },
      },
      behavior: {
        blueprintGeneration: 'Creates default tool-calling loop if blueprint not provided',
        toolLoop: 'Start -> LLM -> Conditional(toolCalls?) -> Tool -> Mutate -> LLM (loop)',
        errorHandling: 'failOnNodeError: false by default for conversation resilience',
        messageOrdering: 'systemPrompt -> state.messages -> input messages',
        runner: 'ChildProcessRunner for depth=0, LocalRunner for depth>0',
      },
      validation: [
        'Name and model are required',
        'Temperature 0-2, maxTokens >= 1',
        'Blueprint must have start node if provided',
      ],
      inlineOperations: true,
    },
    http_request: {
      type: 'http_request',
      description: 'HTTP/HTTPS API call using native fetch with full RequestInit support',
      parameters: {
        url: { type: 'string', required: true, description: 'Full URL with protocol' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], default: 'GET' },
        headers: { type: 'object | Headers | array', description: 'Request headers as object, Headers instance, or [key,value][] pairs' },
        body: { type: 'object | string | null', description: 'Request body (not sent for GET/HEAD)' },
        timeout: { type: 'number', minimum: 1000, default: 30000 },
        credentials: { type: 'string', enum: ['omit', 'same-origin', 'include'] },
        mode: { type: 'string', enum: ['cors', 'no-cors', 'same-origin'] },
        redirect: { type: 'string', enum: ['follow', 'manual', 'error'], default: 'follow' },
        cache: { type: 'string' },
        referrer: { type: 'string' },
        referrerPolicy: { type: 'string' },
        integrity: { type: 'string' },
        keepalive: { type: 'boolean' },
      },
      behavior: {
        input: 'Uses input as body if no explicit body provided',
        output: '{ status, statusText, headers: object, body: parsed JSON or text, url }',
        errorHandling: 'Throws on non-2xx status codes',
        bodyParsing: 'Auto-parses JSON based on content-type header',
      },
      validation: ['URL must be valid with protocol', 'Method must be valid HTTP method', 'Timeout >= 1000ms'],
      inlineOperations: true,
    },
    conditional: {
      type: 'conditional',
      description: 'Evaluates JavaScript expressions for workflow branching',
      parameters: {
        condition: {
          type: 'string | any',
          required: true,
          description: 'JavaScript expression or value for conditional evaluation',
        },
      },
      behavior: {
        input: 'Optional ExecutionItem[] available in expression context',
        output: '{ result: evaluated value, edgeCondition?: string for routing }',
        edgeSelection: 'edgeCondition used to match edge.condition for branching',
        templateSupport: 'Full {{ jsExpression }} support with execution context',
      },
      validation: [
        'Condition required (can be empty string after template resolution)',
        'JavaScript syntax validation for template expressions',
      ],
      examples: [{ condition: '{{ state.retryCount < 3 }}' }, { condition: '{{ $exists($lastOutputOf("api")[0].error) }}' }],
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
            operation: { type: 'string', enum: ['add', 'replace', 'remove', 'copy', 'move', 'test'] },
            path: { type: 'string', description: 'JSON Pointer path (e.g., /field/subfield)' },
            value: { type: 'any', description: 'Value to apply (supports templates)' },
            from: { type: 'string', description: 'Source path for copy/move operations' },
          },
        },
      },
      behavior: {
        input: 'REQUIRED - transforms apply to input data',
        output: 'Transformed input data as single ExecutionItem',
        execution: 'Sequential application - each operation sees previous results',
        scope: 'Input data only - use Mutate for state changes',
      },
      validation: [
        'At least one transform operation required',
        'Input data required for transformation',
        'Valid JSON Pointer paths',
        'from required for copy/move operations',
      ],
    },
    mutate: {
      type: 'mutate',
      description: 'Execution state mutations using reducers (pure-return functions)',
      parameters: {
        reducers: {
          type: 'array',
          required: true,
          description: 'Sequential reducers executed against execution.state',
          schema: {
            name: { type: 'string', required: false },
            if: { type: 'string', required: false, description: 'Template guard; truthy to run' },
            code: { type: 'string', required: true, description: '(state, ctx) => newState' },
            timeoutMs: { type: 'number', required: false },
          },
        },
      },
      behavior: {
        input: 'Optional - available as ctx.input for reducers',
        output: '{ reducersApplied, names, changedKeys, timingsMs }',
        safety: 'Creates snapshot, validates final state, rolls back on error',
        execution: 'Sequential reducers; each sees the latest state',
      },
      validation: [
        'At least one reducer required',
        'Reducer code must compile to a function (state, ctx) => newState',
        'State must remain a valid object after reducers',
      ],
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
          properties: { type: { constant: 'object' }, properties: { type: 'object', description: 'Parameter definitions' }, required: { type: 'array', description: 'Required parameter names' } },
        },
        blueprint: {
          type: 'Blueprint',
          required: true,
          description: 'Workflow blueprint that implements the tool logic',
        },
        toolCallId: { type: 'string', description: 'ID linking to originating assistant toolCall' },
      },
      behavior: {
        input: 'Plain object with tool arguments (pre-parsed by LLM/Agent)',
        output: 'Result from blueprint execution or error with details',
        execution: 'Runs blueprint with depth+1, ChildProcessRunner at depth=0',
        events: 'Emits tool_started and tool_complete with result or error',
        errorHandling: 'Returns { ok: false, error, details } on failure',
      },
      validation: [
        'Name, description, and blueprint required',
        'Parameters must be object type with properties',
        'Blueprint must contain start node',
        'Input must be plain object',
      ],
    },
    workflow: {
      type: 'workflow',
      description: 'Nested workflow execution with embedded blueprint',
      parameters: {
        name: { type: 'string', required: true },
        description: { type: 'string' },
        timeout: { type: 'number', minimum: 1000 },
        blueprint: { type: 'Blueprint', required: true, description: 'Complete workflow blueprint to execute' },
        metadata: { type: 'object' },
      },
      behavior: {
        input: 'Passed to nested workflow as initial input',
        output: 'Result from nested workflow execution',
        execution: 'Creates new execution context with depth+1',
        runner: 'ChildProcessRunner at depth=0, LocalRunner at depth>0',
        inheritance: 'Inherits parent execution context and secureEnv',
      },
      validation: ['Blueprint required with nodes[] and edges[]', 'Must have start node', 'Valid edge references'],
      inlineOperations: true,
    },
    code: {
      type: 'code',
      description: 'JavaScript code execution in controlled sandbox',
      parameters: {
        code: { type: 'string', required: true, description: 'JavaScript code to execute' },
        timeout: { type: 'number', minimum: 100, default: 5000 },
      },
      context: {
        available: [
          '$input - Input data',
          '$lastOutputOf(nodeRef) - Get node output',
          '$state - Execution state',
          '$env(key) - Environment variable',
          'console.log/warn/error - Logging',
          'JSON, Math, Date - Utilities',
        ],
        forbidden: ['setTimeout', 'setInterval', 'require', 'process', 'global', 'globalThis', 'import', 'eval', 'Function'],
      },
      behavior: {
        input: 'Available as $input in code context',
        output: 'Return value from code execution',
        async: 'Supports async/await and promises',
        sanitization: 'Non-finite numbers converted to strings',
      },
      validation: ['Code syntax validation', 'Security pattern checks', 'Timeout >= 100ms'],
      inlineOperations: true,
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
            value: { type: 'any', required: true },
          },
        },
        sourceNodeId: { type: 'string' },
        timeout: { type: 'number', default: 3600000 },
        required: { type: 'boolean', default: true },
      },
      behavior: {
        input: 'Ignored',
        output: '{ message: { role: "user", content: selected choice text } }',
        implementation: 'Platform-specific - requires UI integration',
      },
      validation: ['promptText required', 'At least one choice required'],
    },
  };

  const inlineOperations = {
    description: 'Any node can include inline operations for processing',
    parameters: {
      transforms: { type: 'TransformOperation[]', description: 'Input transformations - runs AFTER main handler on output' },
      reducers: { type: 'ReducerSpec[]', description: 'State reducers - runs AFTER transforms' },
      condition: { type: 'string', description: 'Conditional expression - evaluated AFTER mutations for edge routing' },
    },
    execution: 'Handler -> inline transforms -> inline reducers -> inline condition',
    note: 'Dedicated transform/mutate/conditional nodes skip their respective inline counterparts',
  };

  if (nodeType === 'all') {
    const summary = Object.entries(schemas).map(([type, schema]: any) => ({
      type,
      description: schema.description,
      hasRequiredParams: Object.keys(schema.parameters || {}).some((key) => schema.parameters[key]?.required),
      supportsInlineOps: schema.inlineOperations ?? false,
    }));
    return {
      nodeTypes: summary,
      totalTypes: summary.length,
      inlineOperations,
      templateSupport: 'All string parameters support {{ jsExpression }} templates',
    };
  }

  const schema = (schemas as any)[nodeType];
  if (!schema) {
    return { error: `Unknown node type: ${nodeType}` };
  }

  if (detail === 'summary') {
    return {
      type: schema.type,
      description: schema.description,
      requiredParams: Object.entries(schema.parameters || {})
        .filter(([_, p]: any) => p.required)
        .map(([name]: any) => name),
      supportsInlineOps: schema.inlineOperations ?? false,
    };
  }

  if (detail === 'examples') {
    return { type: schema.type, examples: schema.examples || [], validation: schema.validation };
  }

  const response = { ...schema } as any;
  if (schema.inlineOperations) {
    response.inlineOperations = inlineOperations;
  }
  return response;
}

function getBlueprintExamplesResponse(category: string, pattern?: string) {
  const examples: Record<string, any> = {
    basic: {
      simple_llm: {
        name: 'Simple LLM Query',
        description: 'Basic LLM call with response',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            {
              ref: 'llm_1',
              type: 'llm',
              name: 'Ask AI',
              parameters: {
                model: '{{ state.model }}',
                messages: [{ role: 'user', content: '{{ $input("question") }}' }],
                temperature: 0.7,
                maxTokens: 500,
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.content }}' } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'llm_1' },
            { ref: 'e2', from: 'llm_1', to: 'end_1' },
          ],
        },
      },
      http_fetch: {
        name: 'HTTP API Call',
        description: 'Fetch data from API and transform',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            {
              ref: 'api_1',
              type: 'http_request',
              name: 'Fetch Data',
              parameters: {
                url: '{{ env("API_BASE") }}/data/{{ $input("id") }}',
                method: 'GET',
                headers: { Authorization: 'Bearer {{ env("API_TOKEN") }}' },
              },
            },
            {
              ref: 'transform_1',
              type: 'transform',
              name: 'Extract Fields',
              parameters: {
                transforms: [
                  { operation: 'add', path: '/result', value: '{{ $lastOutputOf("api_1")[0].json.body.data }}' },
                ],
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("transform_1")[0].json.result }}' } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'api_1' },
            { ref: 'e2', from: 'api_1', to: 'transform_1' },
            { ref: 'e3', from: 'transform_1', to: 'end_1' },
          ],
        },
      },
    },
    conditional: {
      api_retry: {
        name: 'API Call with Conditional Retry',
        description: 'Retry failed API calls up to 3 times',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            { ref: 'init_state', type: 'mutate', name: 'Initialize Retry Count', parameters: { mutations: [{ operation: 'add', path: '/state/retryCount', value: 0 }] } },
            {
              ref: 'api_call',
              type: 'http_request',
              name: 'Call API',
              parameters: { url: '{{ $input("url") }}', method: 'POST', body: '{{ $input("payload") }}', timeout: 5000 },
            },
            { ref: 'check_status', type: 'conditional', name: 'Check Success', parameters: { condition: '{{ $lastOutputOf("api_call")[0].json?.status === 200 ? "success" : "retry" }}' } },
            { ref: 'increment_retry', type: 'mutate', name: 'Increment Retry', parameters: { mutations: [{ operation: 'replace', path: '/state/retryCount', value: '{{ state.retryCount + 1 }}' }] } },
            { ref: 'check_retry_limit', type: 'conditional', name: 'Check Retry Limit', parameters: { condition: '{{ state.retryCount < 3 ? "retry" : "fail" }}' } },
            { ref: 'success_end', type: 'end', name: 'Success', parameters: { output: '{{ $lastOutputOf("api_call")[0].json }}' } },
            { ref: 'fail_end', type: 'end', name: 'Failed', parameters: { output: { error: 'API call failed after 3 retries' } } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'init_state' },
            { ref: 'e2', from: 'init_state', to: 'api_call' },
            { ref: 'e3', from: 'api_call', to: 'check_status' },
            { ref: 'e4', from: 'check_status', to: 'success_end', condition: 'success' },
            { ref: 'e5', from: 'check_status', to: 'increment_retry', condition: 'retry' },
            { ref: 'e6', from: 'increment_retry', to: 'check_retry_limit' },
            { ref: 'e7', from: 'check_retry_limit', to: 'api_call', condition: 'retry' },
            { ref: 'e8', from: 'check_retry_limit', to: 'fail_end', condition: 'fail' },
          ],
        },
      },
    },
    llm_patterns: {
      tool_calling_loop: {
        name: 'LLM with Tool Calling Loop',
        description: 'Agent blueprint with automatic tool execution',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            {
              ref: 'llm_1',
              type: 'llm',
              name: 'AI with Tools',
              parameters: {
                model: '{{ state.model }}',
                messages: '{{ state.messages }}',
                tools: '{{ state.tools }}',
                temperature: 0.7,
                reducers: [
                  "(state, ctx) => ({ ...state, messages: [...(state?.messages ?? []), { role: 'assistant', content: ctx.$lastOutputOf('llm_1')[0].json.choices[0].message.content, toolCalls: ctx.$lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls }] })",
                ],
              },
            },
            { ref: 'check_tools', type: 'conditional', name: 'Check Tool Calls', parameters: { condition: "{{ $exists($lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls) ? 'execute' : 'done' }}" } },
            {
              ref: 'prepare_args',
              type: 'code',
              name: 'Prepare Tool Arguments',
              parameters: {
                code: `
                            async function main(ctx) {
                              const toolCall = ctx.$lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0];
                              return toolCall.function.arguments_json || JSON.parse(toolCall.function.arguments);
                            }
                          `,
                timeout: 2000,
              },
            },
            {
              ref: 'tool_1',
              type: 'tool',
              name: 'Execute Tool',
              parameters: {
                name: "{{ $lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls[0].function.name }}",
                description: 'Dynamic tool execution',
                parameters:
                  "{{ (() => { const tools = state.tools; const name = $lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls[0].function.name; return tools.find(t => t.name === name)?.parameters || { type: 'object', properties: {} }; })() }}",
                blueprint:
                  "{{ (() => { const tools = state.tools; const name = $lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls[0].function.name; return tools.find(t => t.name === name)?.blueprint; })() }}",
                reducers: [
                  "(state, ctx) => ({ ...state, messages: [...(state?.messages ?? []), { role: 'tool', toolCallId: ctx.$lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls[0].id, name: ctx.$lastOutputOf('llm_1')[0].json.choices[0].message.toolCalls[0].function.name, content: JSON.stringify(ctx.$lastOutputOf('tool_1')[0].json) }] })",
                ],
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: {} },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'llm_1' },
            { ref: 'e2', from: 'llm_1', to: 'check_tools' },
            { ref: 'e3', from: 'check_tools', to: 'prepare_args', condition: 'execute' },
            { ref: 'e4', from: 'prepare_args', to: 'tool_1' },
            { ref: 'e5', from: 'tool_1', to: 'llm_1' },
            { ref: 'e6', from: 'check_tools', to: 'end_1', condition: 'done' },
          ],
        },
      },
    },
    state_management: {
      complex_transform: {
        name: 'Complex State Transformation',
        description: 'Multi-step data processing with state accumulation',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            { ref: 'init', type: 'mutate', name: 'Initialize State', parameters: { mutations: [ { operation: 'add', path: '/state/items', value: [] }, { operation: 'add', path: '/state/total', value: 0 }, { operation: 'add', path: '/state/metadata', value: { timestamp: '{{ $now() }}' } } ] } },
            { ref: 'fetch_data', type: 'http_request', name: 'Fetch Items', parameters: { url: '{{ $input("apiUrl") }}/items', method: 'GET' } },
            {
              ref: 'process_items',
              type: 'code',
              name: 'Process Items',
              parameters: {
                code: `
                              async function main(ctx) {
                                const items = ctx.$lastOutputOf("fetch_data")[0].json.body;
                                const processed = items.map(item => ({
                                  ...item,
                                  processedAt: Date.now(),
                                  score: item.value * 1.1,
                                }));
                                const total = processed.reduce((sum, item) => sum + item.score, 0);
                                return { items: processed, total };
                              }
                            `,
                timeout: 5000,
              },
            },
            {
              ref: 'update_state',
              type: 'mutate',
              name: 'Update State',
              parameters: {
                reducers: [
                  "(state, ctx) => ({ ...state, items: ctx.$lastOutputOf('process_items')[0].json.items, total: ctx.$lastOutputOf('process_items')[0].json.total })",
                  "(state, ctx) => { const next = { ...(state || {}) }; const count = ctx.$lastOutputOf('process_items')[0].json.items.length; const md = { ...(state?.metadata || {}) }; md.itemCount = count; next.metadata = md; return next; }",
                ],
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: { output: '{{ state }}' } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'init' },
            { ref: 'e2', from: 'init', to: 'fetch_data' },
            { ref: 'e3', from: 'fetch_data', to: 'process_items' },
            { ref: 'e4', from: 'process_items', to: 'update_state' },
            { ref: 'e5', from: 'update_state', to: 'end_1' },
          ],
        },
      },
    },
    nested: {
      tool_with_nested_workflow: {
        name: 'Tool with Nested Workflow',
        description: 'Tool blueprint that contains a nested workflow',
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            {
              ref: 'validate_input',
              type: 'code',
              name: 'Validate Input',
              parameters: {
                code: `
                            async function main(ctx) {
                              const input = ctx.$input || {};
                              if (!input.query) throw new Error('Query is required');
                              if (!input.maxResults) input.maxResults = 10;
                              return input;
                            }
                          `,
                timeout: 1000,
              },
            },
            {
              ref: 'search_workflow',
              type: 'workflow',
              name: 'Execute Search',
              parameters: {
                name: 'Search Workflow',
                blueprint: {
                  nodes: [
                    { ref: 'sub_start', type: 'start', name: 'Start Search', parameters: {} },
                    { ref: 'sub_api', type: 'http_request', name: 'Search API', parameters: { url: 'https://api.search.com/query', method: 'POST', body: { q: '{{ $input("query") }}', limit: '{{ $input("maxResults") }}' } } },
                    {
                      ref: 'sub_filter',
                      type: 'code',
                      name: 'Filter Results',
                      parameters: { code: `\n                                    async function main(ctx) {\n                                      const results = ctx.$lastOutputOf("sub_api")[0].json.body.results;\n                                      return results.filter(r => r.score > 0.5);\n                                    }\n                                  ` },
                    },
                    { ref: 'sub_end', type: 'end', name: 'End Search', parameters: { output: '{{ $lastOutputOf("sub_filter")[0].json }}' } },
                  ],
                  edges: [
                    { ref: 'se1', from: 'sub_start', to: 'sub_api' },
                    { ref: 'se2', from: 'sub_api', to: 'sub_filter' },
                    { ref: 'se3', from: 'sub_filter', to: 'sub_end' },
                  ],
                },
              },
            },
            {
              ref: 'format_results',
              type: 'transform',
              name: 'Format Output',
              parameters: {
                transforms: [
                  {
                    operation: 'add',
                    path: '/formatted',
                    value: {
                      query: '{{ $lastOutputOf("validate_input")[0].json.query }}',
                      resultCount: '{{ $lastOutputOf("search_workflow")[0].json.length }}',
                      results: '{{ $lastOutputOf("search_workflow")[0].json }}',
                    },
                  },
                ],
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("format_results")[0].json.formatted }}' } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'validate_input' },
            { ref: 'e2', from: 'validate_input', to: 'search_workflow' },
            { ref: 'e3', from: 'search_workflow', to: 'format_results' },
            { ref: 'e4', from: 'format_results', to: 'end_1' },
          ],
        },
      },
    },
    error_handling: {
      resilient_workflow: {
        name: 'Resilient Workflow with Error Handling',
        description: 'Workflow that continues despite individual node failures',
        engineConfig: { failOnNodeError: false },
        blueprint: {
          nodes: [
            { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
            { ref: 'primary_api', type: 'http_request', name: 'Primary API', parameters: { url: '{{ $input("primaryUrl") }}', method: 'GET', timeout: 3000 } },
            { ref: 'check_primary', type: 'conditional', name: 'Check Primary Success', parameters: { condition: "{{ $exists($lastOutputOf('primary_api')[0].error) ? 'fallback' : 'success' }}" } },
            { ref: 'fallback_api', type: 'http_request', name: 'Fallback API', parameters: { url: '{{ $input("fallbackUrl") }}', method: 'GET', timeout: 5000 } },
            {
              ref: 'merge_results',
              type: 'code',
              name: 'Merge Results',
              parameters: {
                code: `
                            async function main(ctx) {
                              const primary = ctx.$lastOutputOf("primary_api")[0];
                              const fallback = ctx.$lastOutputOf("fallback_api")[0];
                              
                              if (!primary.error) return { source: 'primary', data: primary.json };
                              if (!fallback.error) return { source: 'fallback', data: fallback.json };
                              return { source: 'none', error: 'Both APIs failed' };
                            }
                          `,
              },
            },
            { ref: 'end_1', type: 'end', name: 'End', parameters: { output: '{{ $lastOutputOf("merge_results")[0].json }}' } },
          ],
          edges: [
            { ref: 'e1', from: 'start_1', to: 'primary_api' },
            { ref: 'e2', from: 'primary_api', to: 'check_primary' },
            { ref: 'e3', from: 'check_primary', to: 'fallback_api', condition: 'fallback' },
            { ref: 'e4', from: 'check_primary', to: 'merge_results', condition: 'success' },
            { ref: 'e5', from: 'fallback_api', to: 'merge_results' },
            { ref: 'e6', from: 'merge_results', to: 'end_1' },
          ],
        },
      },
    },
  };

  const getCategoryExamples = (cat: string) => {
    const categoryExamples = (examples as any)[cat];
    if (!categoryExamples) return [];
    return Object.entries(categoryExamples).map(([key, value]: any) => ({ id: key, ...(value as any) }));
  };

  if (category === 'all') {
    const allExamples: Record<string, any[]> = {};
    for (const [cat] of Object.entries(examples)) {
      allExamples[cat] = getCategoryExamples(cat);
    }
    return {
      examples: allExamples,
      totalCategories: Object.keys(examples).length,
      totalExamples: Object.values(allExamples).reduce((sum, cat) => sum + (cat as any).length, 0),
    };
  }

  const categoryExamples = (examples as any)[category];
  if (!categoryExamples) {
    return { error: `Unknown category: ${category}` };
  }

  if (pattern) {
    const example = categoryExamples[pattern];
    if (!example) {
      return { error: `Pattern "${pattern}" not found in category "${category}"`, available: Object.keys(categoryExamples) };
    }
    return { category, pattern, example };
  }

  return { category, examples: getCategoryExamples(category), count: Object.keys(categoryExamples).length };
}

export default router;


