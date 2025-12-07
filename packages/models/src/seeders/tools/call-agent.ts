import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: Call Agent
 * Delegates work to another agent using conversations:
 * - If no childConversationId is provided, creates a new child conversation
 *   linked to the current one and sends the message there.
 * - If childConversationId is provided, posts the message into that existing
 *   child conversation.
 */
export const agentCallTool: ToolParams = {
  name: 'Call Agent',
  slug: 'call-agent',
  description: `Call another agent on this starship in a linked child conversation.

## Purpose
Use this tool to delegate work to another agent while preserving a parent/child
relationship between conversations. The child conversation records the
delegated agent's turns and usage separately, while remaining attached to the
current conversation for navigation and auditing.

## Parameters
- **slug**: Agent slug to call (required)
- **content**: Text content to send as the user's message (required)
- **childConversationId**: Optional existing child conversation to continue in
- **parentConversationId**: Optional parent conversation id. Defaults to the current conversation when available.

## Input Formats
Example:
\`\`\`json
{
  "slug": "support-agent",
  "content": "Please handle this customer support request"
}
\`\`\`

## Environment Dependencies
Automatically inferred from agent state (do not pass manually):
- **STARSHIP_ID**: Current starship identifier
- **CONVERSATION_ID**: Current parent conversation identifier

## Behavior
Mode A: Create new child conversation
- When childConversationId is NOT provided:
  - Creates a new child conversation with parentConversationId = current conversation id
  - Assigns the target agent (by slug) to that conversation
  - Sends the provided content as the first user message in the child conversation

Mode B: Post into existing child conversation
- When childConversationId IS provided:
  - Sends the provided content as a new user message in that child conversation

In both modes, the tool returns the childConversationId and the HTTP response
from the message send endpoint so callers can inspect status and results.

## Response & Behavior
- **Output**: { childConversationId, status, result, message }
- **Timeout**: 60 seconds for agent execution
- **Common failures**: Agent not found (404), invalid configuration, execution timeout, tool errors`,
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Agent slug to call',
      },
      content: {
        type: 'string',
        description: 'Input text for the delegated agent (user message content)',
      },
      childConversationId: {
        type: 'string',
        description: 'Optional existing child conversation id to continue in',
      },
      parentConversationId: {
        type: 'string',
        description: 'Optional parent conversation id. Defaults to the current conversation when available.',
      },
    },
    required: ['slug', 'content'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare Call Request',
        description: 'Build request payload including parentConversationId when available',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const slug = input.slug;
              if (!slug || typeof slug !== 'string') throw new Error('slug is required');

              const content = typeof input.content === 'string' ? input.content : '';
              if (!content) {
                throw new Error('content is required for calling agent');
              }

              // Derive parentConversationId from input or environment when available
              let parentConversationId = input.parentConversationId;
              try {
                const fromEnv = ctx.env && ctx.env('CONVERSATION_ID');
                if (!parentConversationId && fromEnv) {
                  parentConversationId = String(fromEnv);
                }
              } catch (e) {
                // Ignore env errors; parentConversationId is optional
              }

              return {
                slug,
                parentConversationId,
                childConversationId: typeof input.childConversationId === 'string' ? input.childConversationId : null,
                content,
              };
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'route_mode',
        type: 'conditional',
        name: 'Route Mode',
        description: 'Decide whether to create a new child conversation or use existing',
        parameters: {
          condition: '{{ !(lastOutputOf("prepare") || {}).childConversationId }}',
        },
      },
      {
        ref: 'create_child_conversation',
        type: 'http_request',
        name: 'Create Child Conversation',
        description: 'POST /conversations - create a new child conversation linked to current one',
        parameters: {
          method: 'POST',
          url: '{{ "/conversations" }}',
          connector: 'starships',
          body: '{{ (() => {\n            const prep = lastOutputOf("prepare") || {};\n            const slug = prep.slug || "";\n            const title = "Delegated • " + (slug || "agent");\n            let parentConversationId = prep.parentConversationId;\n            try {\n              const fromEnv = env("CONVERSATION_ID");\n              if (!parentConversationId && fromEnv) {\n                parentConversationId = String(fromEnv);\n              }\n            } catch (e) {}\n            return {\n              title,\n              starshipId: String(env("STARSHIP_ID")),\n              agentSlug: slug || undefined,\n              parentConversationId: parentConversationId || undefined,\n            };\n          })() }}',
          timeout: 10000,
        },
      },
      {
        ref: 'send_message_new',
        type: 'http_request',
        name: 'Send Message (New Child)',
        description: 'POST /conversations/:conversationId/messages - send message into new child conversation',
        parameters: {
          method: 'POST',
          url: '{{ (() => {\n            const raw = lastOutputOf("create_child_conversation") || {};\n            const hasBody = raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "body");\n            const payload = hasBody ? raw.body : raw;\n            const data = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;\n            const cid = data && typeof data === "object" && data.id ? String(data.id) : "";\n            return cid ? "/conversations/" + cid + "/messages" : "";\n          })() }}',
          connector: 'starships',
          body: {
            content: '{{ (lastOutputOf("prepare") || {}).content }}',
          },
          timeout: 60000,
        },
      },
      {
        ref: 'format_result_new',
        type: 'code',
        name: 'Format Result (New Child)',
        description: 'Format result for newly created child conversation',
        parameters: {
          code: `
            async function main(ctx) {
              const http = ctx.input;
              const body = http && typeof http === 'object' ? http.body : http;
              const data = body && typeof body === 'object' && body.data ? body.data : body;

              // Extract child conversation id from previous node
              let childConversationId = null;
              try {
                const raw = ctx.lastOutputOf && ctx.lastOutputOf('create_child_conversation')
                  ? ctx.lastOutputOf('create_child_conversation')
                  : null;
                const hasBody = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body');
                const payload = hasBody ? raw.body : raw;
                const convo = payload && typeof payload === 'object' && payload.data ? payload.data : payload;
                if (convo && typeof convo === 'object' && convo.id) {
                  childConversationId = String(convo.id);
                }
              } catch (e) {
                // best-effort only
              }

              const status = (http && typeof http === 'object' && http.status) ? http.status : 0;
              const success = status >= 200 && status < 300;

              return {
                childConversationId,
                success,
                status,
                result: data,
                message: success
                  ? 'Agent call in new child conversation completed successfully'
                  : 'Agent call in new child conversation failed'
              };
            }
          `,
          timeout: 2000,
        },
      },
      {
        ref: 'send_message_existing',
        type: 'http_request',
        name: 'Send Message (Existing Child)',
        description: 'POST /conversations/:conversationId/messages - send message into existing child conversation',
        parameters: {
          method: 'POST',
          url: '{{ "/conversations/" + ((lastOutputOf("prepare") || {}).childConversationId || "") + "/messages" }}',
          connector: 'starships',
          body: {
            content: '{{ (lastOutputOf("prepare") || {}).content }}',
          },
          timeout: 60000,
        },
      },
      {
        ref: 'format_result_existing',
        type: 'code',
        name: 'Format Result (Existing Child)',
        description: 'Format result for existing child conversation',
        parameters: {
          code: `
            async function main(ctx) {
              const http = ctx.input;
              const body = http && typeof http === 'object' ? http.body : http;
              const data = body && typeof body === 'object' && body.data ? body.data : body;

              const prep = (ctx.lastOutputOf && ctx.lastOutputOf('prepare')) || {};
              const childConversationId = prep && prep.childConversationId ? String(prep.childConversationId) : null;

              const status = (http && typeof http === 'object' && http.status) ? http.status : 0;
              const success = status >= 200 && status < 300;

              return {
                childConversationId,
                success,
                status,
                result: data,
                message: success
                  ? 'Agent call in existing child conversation completed successfully'
                  : 'Agent call in existing child conversation failed'
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
        description: 'Return call result',
        parameters: {
          output: '{{ lastOutputOf("format_result_new") || lastOutputOf("format_result_existing") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'route_mode' },
      { ref: 'e3', from: 'route_mode', to: 'create_child_conversation', condition: 'true' },
      { ref: 'e4', from: 'create_child_conversation', to: 'send_message_new' },
      { ref: 'e5', from: 'send_message_new', to: 'format_result_new' },
      { ref: 'e6', from: 'format_result_new', to: 'end_1' },
      { ref: 'e7', from: 'route_mode', to: 'send_message_existing', condition: 'false' },
      { ref: 'e8', from: 'send_message_existing', to: 'format_result_existing' },
      { ref: 'e9', from: 'format_result_existing', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: call-agent
 */
export const agentCallToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: agentCallTool.name,
  description: agentCallTool.description,
  parameters: agentCallTool.parameters,
  blueprint: agentCallTool.blueprint,

  slug: 'call-agent',
  version: '1.0.1',
  category: 'automation',
  exampleUsage:
    '{ "slug": "support-agent", "input": [{ "role": "user", "content": "Handle this request" }] } // delegate with messages\n{ "slug": "analyzer", "input": "Analyze this data in a child conversation" } // delegate with simple text',
  requiresApiKey: false,
  configurationFields: [],
};
