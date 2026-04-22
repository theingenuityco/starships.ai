import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: Read Conversation Messages (tail-offset)
 *
 * Enables an agent with rolling memory (bounded to N messages in the prompt) to fetch
 * older messages by specifying an `offset` (skip N most recent messages) and `limit`.
 */
export const readConversationMessagesTool: ToolParams = {
  name: 'Read Older Messages',
  slug: 'read-older-messages',
  description:
    'Read older conversation history beyond the agent prompt window. `offset` skips that many most recent messages (tail offset), then returns the next `limit` older messages (chronological order).',
  parameters: {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        description: 'Conversation id (optional; defaults to the current CONVERSATION_ID runtime env)',
      },
      limit: {
        type: 'number',
        description: 'How many messages to return (1-200). Keep this small to reduce tokens.',
      },
      offset: {
        type: 'number',
        description:
          'How many most recent messages to skip (tail offset). Example: offset=30 reads messages immediately older than the newest 30.',
      },
    },
    required: ['limit', 'offset'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Request',
        description: 'Validate limit/offset and resolve conversationId',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
              const limitRaw = input.limit;
              const offsetRaw = input.offset;

              const limit = Math.max(1, Math.min(200, Number(limitRaw)));
              if (!Number.isFinite(limit)) throw new Error('limit must be a number');

              const offset = Math.max(0, Math.min(100000, Number(offsetRaw)));
              if (!Number.isFinite(offset)) throw new Error('offset must be a number');

              const conversationId =
                (typeof input.conversationId === 'string' && input.conversationId.trim().length > 0
                  ? input.conversationId.trim()
                  : String(ctx.env && ctx.env('CONVERSATION_ID')));

              if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
                throw new Error('conversationId is required (either provide it or ensure CONVERSATION_ID is set)');
              }

              return { conversationId, limit, offset, timeout: 10000 };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'http_get_messages',
        type: 'connector_action',
        name: 'Get Conversation Messages (Starships)',
        description: 'GET /conversations/:conversationId/messages via Starships connector endpoint catalog',
        parameters: {
          connector: 'starships',
          action: 'get-conversation-messages',
          failOnNon2xx: true,
          args: {
            conversationId: '{{ (lastOutputOf("prepare") || {}).conversationId }}',
            limit: '{{ (lastOutputOf("prepare") || {}).limit }}',
            offset: '{{ (lastOutputOf("prepare") || {}).offset }}',
          },
          timeout: '{{ (lastOutputOf("prepare") || {}).timeout }}',
        },
      },
      {
        ref: 'unwrap',
        type: 'code',
        name: 'Unwrap',
        description: 'Return body.data/body.error where applicable; otherwise return body/resp',
        parameters: {
          code: `
            async function main(ctx) {
              const resp = ctx.lastOutputOf('http_get_messages') || {};
              const body = resp && typeof resp === 'object' ? resp.body : undefined;
              if (body && typeof body === 'object') {
                if (body.success === true) return body.data ?? body;
                if (body.success === false) return body.error ?? body;
              }
              return body ?? resp;
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'slim',
        type: 'code',
        name: 'Slim',
        description: 'Return a minimal, token-efficient message list',
        parameters: {
          code: `
            async function main(ctx) {
              const data = ctx.input;
              const prepared = ctx.lastOutputOf('prepare') || {};

              // Pass through error-like payloads unchanged.
              if (data && typeof data === 'object') {
                const t = data;
                if (typeof t.code === 'string' && typeof t.message === 'string') return t;
              }

              const msgs = data && typeof data === 'object' && Array.isArray(data.messages) ? data.messages : [];
              
              // Filter/redact nested read-conversation-messages payloads to prevent recursive ballooning.
              const looksLikeNestedRead = (s) => {
                if (typeof s !== 'string') return false;
                const str = s.trim();
                if (!str) return false;
                // Cheap pre-check to avoid parsing most strings.
                if (!(str.startsWith('{') && str.includes('"messages"'))) return false;
                try {
                  const obj = JSON.parse(str);
                  if (!obj || typeof obj !== 'object') return false;
                  if (!Array.isArray(obj.messages)) return false;
                  if (!('limit' in obj) || !('offset' in obj)) return false;
                  // Extra hint: this tool's output shape includes these keys.
                  if (!('hasMoreBefore' in obj) && !('oldestCursor' in obj)) return false;
                  return true;
                } catch {
                  return false;
                }
              };

              const outMessages = msgs.map((m) => {
                const content = m && typeof m.content === 'string' ? m.content : '';
                const nested = looksLikeNestedRead(content);
                return {
                  id: m && m.id,
                  role: m && m.role,
                  createdAt: m && m.createdAt,
                  // If nested, strip content entirely (leave a marker so callers can tell it was redacted).
                  content: nested ? '' : content,
                  ...(nested ? { redacted: true, redactionReason: 'nested_read_conversation_messages' } : {}),
                };
              });

              return {
                conversationId: data && data.conversationId,
                limit: prepared.limit,
                offset: prepared.offset,
                hasMoreBefore: data && data.hasMoreBefore,
                oldestCursor: data && data.oldestCursor,
                messages: outMessages,
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
        description: '',
        parameters: {
          output: '{{ lastOutputOf("slim") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'http_get_messages' },
      { ref: 'e3', from: 'http_get_messages', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'slim' },
      { ref: 'e5', from: 'slim', to: 'end_1' },
    ],
    metadata: {},
  },
};
