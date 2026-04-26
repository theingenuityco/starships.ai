import { Agent } from '../Agent';
import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { ToolParams } from '@/types/node-parameters';
import type { HostRuntime } from '@/types/node-handler';

describe('Agent default blueprint - multiple tool calls (parallel batch)', () => {
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
      http: async () => {
        throw new Error('http not used in this test');
      },
      connectorAction: async ({ connector, action, args, timeoutMs }) => {
        // Mirror Starships batch-execute-tools server contract:
        // args.tools[] → results[]
        const objArgs = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) as Record<string, unknown>;
        const tools = Array.isArray(objArgs.tools) ? (objArgs.tools as Array<Record<string, unknown>>) : [];

        const results = tools.map((t) => {
          const toolSlug = String(t.toolSlug ?? '');
          const toolCallId = String(t.toolCallId ?? '');
          const toolInput = (t.args && typeof t.args === 'object' ? (t.args as Record<string, unknown>) : {}) as Record<string, unknown>;
          const label = toolSlug === 'tool_a' ? 'A' : toolSlug === 'tool_b' ? 'B' : 'UNKNOWN';
          return { kind: 'success', toolCallId, result: { label, input: toolInput } };
        });

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { success: true, data: { results } },
          url: `connector://${String(connector)}/${String(action)}`,
          timeoutMs,
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
    expect(JSON.parse(String(msgs[2]?.content))).toMatchObject({ success: true, data: { label: 'A', input: { value: 'one' } } });

    expect(msgs[3]).toMatchObject({ role: 'tool', toolCallId: 'call_2' });
    expect(typeof msgs[3]?.content).toBe('string');
    expect(JSON.parse(String(msgs[3]?.content))).toMatchObject({ success: true, data: { label: 'B', input: { value: 'two' } } });

    expect(msgs[4]).toMatchObject({ role: 'assistant', content: 'done' });
  });

  it('does not infer failure from inner status without an explicit throw', async () => {
    const toolA = makeTool('tool_a', 'A');

    let llmCallCount = 0;
    const hostRuntime: HostRuntime = {
      http: async () => {
        throw new Error('http not used in this test');
      },
      connectorAction: async ({ connector, action, args, timeoutMs }) => {
        const objArgs = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) as Record<string, unknown>;
        const tools = Array.isArray(objArgs.tools) ? (objArgs.tools as Array<Record<string, unknown>>) : [];

        const results = tools.map((t) => {
          const toolCallId = String(t.toolCallId ?? '');
          return {
            kind: 'success',
            toolCallId,
            // Inner tool result looks like an HTTP 400 response.
            // The agent wrapper should NOT reinterpret this as failure.
            result: { status: 400, statusText: 'Bad Request', body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'bad' } } },
          };
        });

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { success: true, data: { results } },
          url: `connector://${String(connector)}/${String(action)}`,
          timeoutMs,
        };
      },
      llm: async () => {
        llmCallCount++;
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
                    tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: '{"value":"one"}' } }],
                  },
                },
              ],
            };
            yield { id: 'resp_1', model: 'test-model', created: 0, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] };
          }
          return stream();
        }

        async function* stream() {
          yield { id: 'resp_2', model: 'test-model', created: 0, choices: [{ index: 0, delta: { content: 'done' } }] };
          yield { id: 'resp_2', model: 'test-model', created: 0, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
        }
        return stream();
      },
    };

    const agent = new Agent({
      name: 'TestAgent',
      model: 'test-model',
      state: {
        messages: [{ role: 'user', content: 'hi' }],
        tools: [toolA],
      },
    });

    const blueprint = agent.getCurrentBlueprint();
    const execution = ExecutionItemUtils.createExecution();
    execution.state = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [toolA],
    };

    const engine = new Engine({ hostRuntime, failOnNodeError: false });
    await engine.executeBlueprint(blueprint, execution);

    const state = execution.state as Record<string, unknown>;
    const msgsUnknown = state.messages;
    expect(Array.isArray(msgsUnknown)).toBe(true);
    const msgs = msgsUnknown as Array<Record<string, unknown>>;
    expect(msgs).toHaveLength(4);
    expect(msgs[2]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
    const parsed = JSON.parse(String(msgs[2]?.content));
    expect(parsed).toMatchObject({
      success: true,
      data: { status: 400, body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'bad' } } },
    });
  });

  it('resumes a pending tool-call batch without re-calling the LLM for tool selection', async () => {
    const toolA = makeTool('tool_a', 'A');

    let llmCallCount = 0;
    const hostRuntime: HostRuntime = {
      http: async () => {
        throw new Error('http not used in this test');
      },
      connectorAction: async ({ connector, action, args, timeoutMs }) => {
        const objArgs = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) as Record<string, unknown>;
        const tools = Array.isArray(objArgs.tools) ? (objArgs.tools as Array<Record<string, unknown>>) : [];

        const results = tools.map((t) => {
          const toolSlug = String(t.toolSlug ?? '');
          const toolCallId = String(t.toolCallId ?? '');
          const toolInput = (t.args && typeof t.args === 'object' ? (t.args as Record<string, unknown>) : {}) as Record<string, unknown>;
          const label = toolSlug === 'tool_a' ? 'A' : 'UNKNOWN';
          return { kind: 'success', toolCallId, result: { label, input: toolInput } };
        });

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { success: true, data: { results } },
          url: `connector://${String(connector)}/${String(action)}`,
          timeoutMs,
        };
      },
      llm: async () => {
        llmCallCount++;
        // On resume, we should NOT call the LLM to generate tool calls again.
        // The only LLM call should be the post-tools continuation.
        async function* stream() {
          yield { id: 'resp_resume', model: 'test-model', created: 0, choices: [{ index: 0, delta: { content: 'done' } }] };
          yield { id: 'resp_resume', model: 'test-model', created: 0, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
        }
        return stream();
      },
    };

    const agent = new Agent({
      name: 'TestAgent',
      model: 'test-model',
      state: {
        messages: [{ role: 'user', content: 'hi' }],
        tools: [toolA],
      },
    });

    const blueprint = agent.getCurrentBlueprint();
    const execution = ExecutionItemUtils.createExecution();
    // Simulate a persisted mid-batch resume:
    // - assistant message already contains toolCalls
    // - pendingToolCalls/pendingToolCallIndex indicate which tool call to execute next
    execution.state = {
      model: 'test-model',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: { value: 'one' } } }],
        },
      ],
      tools: [toolA],
      pendingToolCalls: [{ id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: { value: 'one' } } }],
      pendingToolCallIndex: 0,
    };

    const engine = new Engine({ hostRuntime, failOnNodeError: false });
    await engine.executeBlueprint(blueprint, execution);

    // Tool executed, then LLM called once to continue.
    expect(llmCallCount).toBe(1);

    const state = execution.state as Record<string, unknown>;
    const msgs = state.messages as Array<Record<string, unknown>>;
    // user, assistant(toolCalls), tool(call_1), assistant(final)
    expect(msgs).toHaveLength(4);
    expect(msgs[2]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
    expect(JSON.parse(String(msgs[2]?.content))).toMatchObject({ success: true, data: { label: 'A', input: { value: 'one' } } });
    expect(msgs[3]).toMatchObject({ role: 'assistant', content: 'done' });
  });

  it('pauses execution and retains only approval-pending tools when batch returns mixed results', async () => {
    const toolA = makeTool('tool_a', 'A');
    const toolB = makeTool('tool_b', 'B');

    let llmCallCount = 0;
    const hostRuntime: HostRuntime = {
      http: async () => {
        throw new Error('http not used in this test');
      },
      connectorAction: async ({ connector, action, args, timeoutMs }) => {
        const objArgs = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) as Record<string, unknown>;
        const tools = Array.isArray(objArgs.tools) ? (objArgs.tools as Array<Record<string, unknown>>) : [];

        const results = tools.map((t) => {
          const toolSlug = String(t.toolSlug ?? '');
          const toolCallId = String(t.toolCallId ?? '');
          const toolInput = (t.args && typeof t.args === 'object' ? (t.args as Record<string, unknown>) : {}) as Record<string, unknown>;
          if (toolSlug === 'tool_a') {
            return { kind: 'success', toolCallId, result: { label: 'A', input: toolInput } };
          }
          // tool_b requires approval
          return { kind: 'approval_required', toolCallId, approvalId: 'appr_1', agentId: 'agent_1', toolSlug };
        });

        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { success: true, data: { results } },
          url: `connector://${String(connector)}/${String(action)}`,
          timeoutMs,
        };
      },
      llm: async () => {
        llmCallCount++;
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
          yield { id: 'resp_1', model: 'test-model', created: 0, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] };
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
    execution.state = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [toolA, toolB],
    };

    const engine = new Engine({ hostRuntime, failOnNodeError: false });
    await engine.executeBlueprint(blueprint, execution);

    // LLM called once; execution pauses at approval — no second LLM call.
    expect(llmCallCount).toBe(1);

    const state = execution.state as Record<string, unknown>;
    const msgs = state.messages as Array<Record<string, unknown>>;
    // user, assistant(toolCalls), tool(call_1 — completed) — call_2 is NOT appended (approval pending)
    expect(msgs).toHaveLength(3);
    expect(msgs[2]).toMatchObject({ role: 'tool', toolCallId: 'call_1' });
    expect(JSON.parse(String(msgs[2]?.content))).toMatchObject({ success: true, data: { label: 'A' } });

    // Only the approval-pending tool remains in pendingToolCalls.
    const pending = state.pendingToolCalls as Array<Record<string, unknown>>;
    expect(Array.isArray(pending)).toBe(true);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: 'call_2' });
  });
});
