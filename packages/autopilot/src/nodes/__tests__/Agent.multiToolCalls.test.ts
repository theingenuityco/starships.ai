import { Agent } from '../Agent';
import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { ToolParams } from '@/types/node-parameters';
import type { HostRuntime } from '@/types/node-handler';

describe('Agent default blueprint - multiple tool calls (sequential)', () => {
  const makeTool = (slug: string, label: string): ToolParams => ({
    name: `Tool ${label}`,
    slug,
    description: `Return label ${label}`,
    parameters: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
    },
    blueprint: {
      nodes: [
        { ref: 's', type: 'start', name: 'Start', description: '', parameters: {} },
        {
          ref: 'code',
          type: 'code',
          name: 'Run',
          description: '',
          parameters: {
            code: `
              async function main(ctx) {
                return { label: ${JSON.stringify(label)}, input: ctx.input || null };
              }
            `,
          },
        },
        { ref: 'e', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("code") }}' } },
      ],
      edges: [
        { ref: 'e1', from: 's', to: 'code' },
        { ref: 'e2', from: 'code', to: 'e' },
      ],
      metadata: {},
    },
  });

  it('executes all tool calls from a single assistant response before resuming the LLM', async () => {
    const toolA = makeTool('tool_a', 'A');
    const toolB = makeTool('tool_b', 'B');

    let llmCallCount = 0;
    const hostRuntime: HostRuntime = {
      http: async (req) => {
        const body = (req?.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}) as Record<string, unknown>;
        const toolSlug = String(body.toolSlug ?? '');
        const toolCallId = String(body.toolCallId ?? '');
        const args = (body.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {}) as Record<string, unknown>;

        const label = toolSlug === 'tool_a' ? 'A' : toolSlug === 'tool_b' ? 'B' : 'UNKNOWN';

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          url: String(req?.url ?? ''),
          // Mirror server contract: { success: true, data: { toolCallId, result } }
          body: {
            success: true,
            data: {
              toolCallId,
              result: { label, input: args },
            },
          },
        };
      },
      connectorAction: async ({ connector, action, args, timeoutMs }) => {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { ok: true, connector, action, args, timeoutMs },
          url: `connector://${String(connector)}/${String(action)}`,
        };
      },
      llm: async () => {
        llmCallCount++;

        // Call 1: two tool calls in a single assistant message
        if (llmCallCount === 1) {
          async function* stream() {
            yield {
              id: 'resp_1',
              model: 'test-model',
              created: 0,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      { index: 0, id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{"value":"one"}' } },
                      { index: 1, id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: '{"value":"two"}' } },
                    ],
                  },
                },
              ],
            };
            yield {
              id: 'resp_1',
              model: 'test-model',
              created: 0,
              choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            };
          }
          return stream();
        }

        // Call 2: final assistant message (no tools)
        async function* stream() {
          yield {
            id: 'resp_2',
            model: 'test-model',
            created: 0,
            choices: [{ index: 0, delta: { content: 'done' } }],
          };
          yield {
            id: 'resp_2',
            model: 'test-model',
            created: 0,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          };
        }
        return stream();
      },
    };

    const agent = new Agent({
      name: 'TestAgent',
      model: 'test-model',
      state: {
        messages: [{ role: 'user', content: 'hi' }],
        tools: [toolA, toolB],
      },
    });

    const blueprint = agent.getCurrentBlueprint();
    const execution = ExecutionItemUtils.createExecution();
    // Seed state as the Agent default blueprint expects (LLM node templates read state.messages/state.tools)
    execution.state = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [toolA, toolB],
    };

    const engine = new Engine({ hostRuntime, failOnNodeError: false });
    await engine.executeBlueprint(blueprint, execution);

    const state = execution.state as Record<string, unknown>;
    const msgsUnknown = state.messages;
    expect(Array.isArray(msgsUnknown)).toBe(true);
    const msgs = msgsUnknown as Array<Record<string, unknown>>;
    expect(Array.isArray(msgs)).toBe(true);

    // user, assistant(toolCalls), tool(call_1), tool(call_2), assistant(final)
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'hi' });

    expect(msgs[1]?.role).toBe('assistant');
    const toolCalls = msgs[1]?.toolCalls;
    expect(Array.isArray(toolCalls)).toBe(true);
    expect((toolCalls as unknown[]).length).toBe(2);

    expect(msgs[2]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
    expect(typeof msgs[2]?.content).toBe('string');
    expect(JSON.parse(String(msgs[2]?.content))).toMatchObject({
      success: true,
      data: { toolCallId: 'call_1', result: { label: 'A', input: { value: 'one' } } },
    });

    expect(msgs[3]).toMatchObject({ role: 'tool', toolCallId: 'call_2' });
    expect(typeof msgs[3]?.content).toBe('string');
    expect(JSON.parse(String(msgs[3]?.content))).toMatchObject({
      success: true,
      data: { toolCallId: 'call_2', result: { label: 'B', input: { value: 'two' } } },
    });

    expect(msgs[4]).toMatchObject({ role: 'assistant', content: 'done' });
  });
});
