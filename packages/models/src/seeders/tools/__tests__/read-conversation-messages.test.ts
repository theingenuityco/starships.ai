/**
 * Read Conversation Messages Tool Tests
 */

import { readConversationMessagesTool } from '../read-conversation-messages';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, HostRuntime, NodeHandlerOptions } from '@starships/autopilot';

describe('Read Conversation Messages', () => {
  it('has a valid tool + template definition', () => {
    expect(readConversationMessagesTool.slug).toBe('read-older-messages');
  });

  it('requires limit + offset', () => {
    const req = readConversationMessagesTool.parameters.required || [];
    expect(req).toEqual(expect.arrayContaining(['limit', 'offset']));
  });

  it('uses the starships connector action get-conversation-messages', () => {
    const bp = readConversationMessagesTool.blueprint;
    const httpNode = bp.nodes.find((n) => n.ref === 'http_get_messages');
    expect(httpNode).toBeTruthy();
    const params = (httpNode as { parameters?: unknown }).parameters as { connector?: string; action?: string } | undefined;
    expect(params?.connector).toBe('starships');
    expect(params?.action).toBe('get-conversation-messages');
  });

  it('executes and returns a slim message payload', async () => {
    const nestedPayload = JSON.stringify({
      conversationId: 'conv_older',
      limit: 2,
      offset: 30,
      hasMoreBefore: false,
      oldestCursor: null,
      messages: [{ id: 'x', role: 'user', content: 'nested' }],
    });

    const mockApiBody = {
      success: true,
      data: {
        conversationId: 'conv_1234567890',
        hasMoreBefore: true,
        oldestCursor: { createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(), id: 'msg_old' },
        messages: [
          { id: 'm1', role: 'user', content: 'hello', createdAt: new Date('2026-01-01T00:00:01.000Z').toISOString() },
          // Nested tool output should be redacted by the tool.
          { id: 'm2', role: 'assistant', content: nestedPayload, createdAt: new Date('2026-01-01T00:00:02.000Z').toISOString() },
        ],
      },
    };

    const hostRuntime: HostRuntime = {
      http: jest.fn() as HostRuntime['http'],
      connectorAction: jest.fn(async () => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: mockApiBody,
        url: 'connector://starships/get-conversation-messages',
      })) as HostRuntime['connectorAction'],
    };

    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
      runtimeEnv: { CONVERSATION_ID: 'conv_1234567890' },
      hostRuntime,
      execution: ExecutionItemUtils.createExecution(),
    };

    const toolNode = new Tool(readConversationMessagesTool, options);
    const result = await toolNode.execute([{ json: { limit: 2, offset: 30 }, pairedItem: { item: 0 } } as ExecutionItem]);
    const out = ExecutionItemUtils.unwrapSingle(result);

    expect(out).toMatchObject({
      conversationId: 'conv_1234567890',
      limit: 2,
      offset: 30,
      hasMoreBefore: true,
      messages: [
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'm2', role: 'assistant', content: '', redacted: true, redactionReason: 'nested_read_conversation_messages' },
      ],
    });
  });
});

