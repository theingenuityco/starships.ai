import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Test Agent
 * Test an agent's execution with provided input messages or data
 */
export const agentTestTool: ToolParams = {
  name: 'Test Agent',
  slug: 'test-agent',
  description: `Test an agent's execution with sample input to validate configuration and behavior.

## Purpose
Execute an agent with test input to verify:
- Agent configuration is valid
- Blueprint executes without errors
- System prompt produces expected behavior
- Assigned tools work correctly
- Response quality meets requirements

## Required Parameters
- **slug**: Agent slug to test
- **input**: Test input (messages array or simple text)

## Input Formats
For conversational agents, provide messages array:
\`\`\`json
{
  "slug": "support-agent",
  "input": [
    { "role": "user", "content": "Hello, I need help" }
  ]
}
\`\`\`

For simple text input:
\`\`\`json
{
  "slug": "analyzer",
  "input": "Analyze this data"
}
\`\`\`

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **BASE_URL**: API server endpoint
- **AUTH_TOKEN**: Authentication token
- **STARSHIP_ID**: Current starship identifier

## Response & Behavior
- **Output**: Agent execution result with response, status, and any errors
- **Timeout**: 60 seconds for agent execution
- **Common failures**: Agent not found (404), invalid configuration, execution timeout, tool errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Agent slug to test',
      },
      input: {
        description: 'Test input - messages array or simple text',
      },
    },
    required: ['slug', 'input'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Test Request',
        description: 'Build test execution request',
        parameters: {
          code: `
            async function main(ctx) {
              const envFn = ctx && typeof ctx === 'object' && typeof ctx.$env === 'function' ? ctx.$env : undefined;
              const baseUrlRaw = envFn ? envFn('BASE_URL') : undefined;
              const baseUrl = typeof baseUrlRaw === 'string' ? baseUrlRaw.replace(/\\/+$/, '') : '';
              if (!baseUrl) throw new Error('BASE_URL is required');
              const authToken = envFn ? envFn('AUTH_TOKEN') : undefined;
              const starshipId = envFn ? envFn('STARSHIP_ID') : undefined;
              if (!authToken) throw new Error('AUTH_TOKEN is required');
              if (!starshipId) throw new Error('STARSHIP_ID is required');

              if (!ctx || typeof ctx !== 'object' || !ctx.$input) {
                throw new Error('Tool arguments missing');
              }

              const slug = ctx.$input.slug;
              if (!slug || typeof slug !== 'string') throw new Error('slug is required');

              if (ctx.$input.input === undefined) {
                throw new Error('input is required for testing');
              }

              // Normalize input to messages array format if needed
              let testInput = ctx.$input.input;
              if (typeof testInput === 'string') {
                testInput = [{ role: 'user', content: testInput }];
              }

              return {
                url: String(baseUrl) + '/starships/' + String(starshipId) + '/agents/' + String(slug) + '/test',
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + String(authToken),
                  'Content-Type': 'application/json'
                },
                body: {
                  input: testInput
                }
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_test',
        type: 'http_request',
        name: 'Execute Agent Test',
        description: 'POST /starships/:starshipId/agents/:slug/test',
        parameters: {
          url: '{{ $lastOutputOf("prepare")[0].json.url }}',
          method: '{{ $lastOutputOf("prepare")[0].json.method }}',
          headers: '{{ $lastOutputOf("prepare")[0].json.headers }}',
          body: '{{ $lastOutputOf("prepare")[0].json.body }}',
          timeout: 60000,
        },
      },
      {
        ref: 'format_result',
        type: 'code',
        name: 'Format Test Result',
        description: 'Format test execution result for display',
        parameters: {
          code: `
            async function main(ctx) {
              const http = ctx.$input;
              const body = http && typeof http === 'object' ? http.body : http;
              const data = (body && typeof body === 'object' && body.data) ? body.data : body;

              // Extract key information from test result
              const status = (http && typeof http === 'object' && http.status) ? http.status : 0;
              const success = status >= 200 && status < 300;
              
              return {
                success,
                status,
                result: data,
                message: success 
                  ? 'Agent test completed successfully' 
                  : 'Agent test failed'
              };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return test result',
        parameters: {
          output: '{{ $lastOutputOf("format_result")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_test' },
      { ref: 'e3', from: 'http_test', to: 'format_result' },
      { ref: 'e4', from: 'format_result', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: test-agent
 */
export const agentTestToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentTestTool.name,
  description: agentTestTool.description,
  parameters: agentTestTool.parameters,
  blueprint: agentTestTool.blueprint,

  slug: 'test-agent',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent", "input": [{ "role": "user", "content": "Hello" }] } // test with messages\n{ "slug": "analyzer", "input": "Test data" } // test with simple text',
  requiresApiKey: false,
  configurationFields: [],
};
