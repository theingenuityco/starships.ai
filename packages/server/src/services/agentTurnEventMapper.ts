/**
 * agentTurnEventMapper
 *
 * The single mapping from the code-native agent loop's events (CliAgentEvent)
 * onto the product's conversation stream (ConversationStreamEvent) + persistence.
 * Both transports — in-process and the Docker sandbox — feed their events through
 * a mapper built here, so streaming/persistence behaves identically regardless of
 * where the loop ran.
 *
 * Key invariant for token streaming: assistant messages are persisted with their
 * `turnId` via upsertMessageByTurnSlot. The client keys reconciliation of the
 * `stream-${turnId}` delta placeholder on `message.turnId === turnId`, so writing
 * the turnId is what lets the streamed placeholder collapse into the final message.
 */

import { serializeToolResult } from '@starships/autopilot-cli';
import type { CliAgentEvent, CliAgentEventSink } from '@starships/autopilot-cli';
import { ToolCallApprovalRepository } from '@starships/models';
import type { MessageService } from '@/services/MessageService';
import type { ConversationStreamBus } from '@/services/ConversationStreamBus';

// Lazily instantiated so importing this module never constructs repositories at
// load time (keeps partially-mocked test suites and DB-less imports working).
let _approvalRepo: ToolCallApprovalRepository | undefined;
const approvalRepo = (): ToolCallApprovalRepository => (_approvalRepo ??= new ToolCallApprovalRepository());

export interface AgentTurnEventMapperDeps {
  messageService: MessageService;
  streamBus: ConversationStreamBus;
}

export interface AgentTurnEventMapperContext {
  conversationId: string;
  turnId: string;
  starshipId: string;
  agentId: string;
  agentName: string;
  /** Canonical model id, surfaced on turn.usage for UX/debug. */
  model: string;
}

type UpsertReq = Parameters<MessageService['upsertMessageByTurnSlot']>[0];

/**
 * Build a per-turn event sink. Holds per-turn state: the streamed-delta position
 * counter and the next turn-slot sequence. Create one per turn run; reuse it for
 * the whole run (including resume), and across both transports for that run.
 */
export function createAgentTurnEventMapper(deps: AgentTurnEventMapperDeps, ctx: AgentTurnEventMapperContext): CliAgentEventSink {
  const streamMessageId = `stream-${ctx.turnId}`;
  let deltaPos = 0;

  // Turn-slot sequencing. The user message occupies an earlier slot in this turn,
  // and on resume prior assistant/tool messages already occupy slots — so we start
  // after the max existing slot rather than at a fixed offset. Resolved lazily once.
  let seqBase: number | null = null;
  let seqOffset = 0;
  const nextTurnSeq = async (): Promise<number> => {
    if (seqBase === null) seqBase = await deps.messageService.getMaxTurnSeq(ctx.turnId);
    seqOffset += 1;
    return seqBase + seqOffset;
  };

  const at = (): string => new Date().toISOString();

  return async (event: CliAgentEvent): Promise<void> => {
    switch (event.type) {
      // turn.started is single-sourced in ConversationService at turn creation; don't double-emit.
      case 'turn_started':
        return;

      case 'assistant_delta': {
        deltaPos += event.text.length;
        await deps.streamBus.publish(ctx.conversationId, {
          type: 'assistant.delta',
          data: {
            conversationId: ctx.conversationId,
            turnId: ctx.turnId,
            messageId: streamMessageId,
            agentId: ctx.agentId,
            agentName: ctx.agentName,
            delta: event.text,
            position: deltaPos,
            at: at(),
          },
        });
        return;
      }

      case 'assistant_message': {
        const m = event.message;

        // Usage first (UX/debug rings), then the persisted message append.
        if (event.usage) {
          await deps.streamBus.publish(ctx.conversationId, {
            type: 'turn.usage',
            data: {
              conversationId: ctx.conversationId,
              turnId: ctx.turnId,
              at: at(),
              agentId: ctx.agentId,
              agentName: ctx.agentName,
              model: ctx.model,
              usage: {
                promptTokens: event.usage.promptTokens ?? 0,
                completionTokens: event.usage.completionTokens ?? 0,
                totalTokens: event.usage.totalTokens ?? 0,
                ...(event.usage.cost != null ? { cost: event.usage.cost } : {}),
              },
            },
          });
        }

        const toolCalls = (m.toolCalls ?? []).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }));
        const req = {
          conversationId: ctx.conversationId,
          turnId: ctx.turnId,
          turnSeq: await nextTurnSeq(),
          role: 'assistant',
          content: m.content,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
          ...(m.reasoning ? { reasoning: m.reasoning } : {}),
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        } as unknown as UpsertReq;
        const persisted = await deps.messageService.upsertMessageByTurnSlot(req);
        await deps.streamBus.publish(ctx.conversationId, {
          type: 'message.append',
          data: { conversationId: ctx.conversationId, message: persisted },
        });

        // Any further assistant output in this turn streams into a fresh placeholder.
        deltaPos = 0;
        return;
      }

      // tool_started has no client consumer; intentionally not surfaced.
      case 'tool_started':
        return;

      case 'tool_result': {
        const req = {
          conversationId: ctx.conversationId,
          turnId: ctx.turnId,
          turnSeq: await nextTurnSeq(),
          role: 'tool',
          content: serializeToolResult(event.result),
          toolCallId: event.toolCallId,
          messageType: 'tool_result',
          agentId: ctx.agentId,
          agentName: ctx.agentName,
        } as unknown as UpsertReq;
        const persisted = await deps.messageService.upsertMessageByTurnSlot(req);
        await deps.streamBus.publish(ctx.conversationId, {
          type: 'message.append',
          data: { conversationId: ctx.conversationId, message: persisted },
        });
        return;
      }

      case 'approval_required': {
        // Persist an approval record (idempotent per conversation+toolCallId) so the
        // existing approve/deny UI + routes can resolve it; resume re-enters the loop.
        let approvalId: string | undefined;
        try {
          const existing = await approvalRepo()
            .findByConversationAndToolCallId(ctx.conversationId, event.toolCallId)
            .catch(() => null);
          // Only reuse a still-pending record. A stale decided record (reused toolCallId from a
          // prior turn) must not be handed back as approvalId, or approve/deny would be a no-op
          // (they only update `pending` rows) and the turn would hang.
          if (existing && existing.status === 'pending') {
            approvalId = existing.id;
          } else {
            const created = await approvalRepo().createPendingForCli({
              starshipId: ctx.starshipId,
              conversationId: ctx.conversationId,
              agentId: ctx.agentId,
              toolName: event.name,
              toolCallId: event.toolCallId,
              argsJson: event.args,
            });
            approvalId = created.id;
          }
        } catch (err) {
          // Best-effort: still surface the prompt even if persistence failed. Log so a rare
          // toolCallId collision (UNIQUE conflict against a stale decided row) is observable.
          console.warn(
            `[agentTurnEventMapper] approval persist failed for toolCallId=${event.toolCallId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        await deps.streamBus.publish(ctx.conversationId, {
          type: 'ui_action',
          data: {
            action: 'tool_approval_required',
            payload: {
              ...(approvalId ? { approvalId } : {}),
              conversationId: ctx.conversationId,
              starshipId: ctx.starshipId,
              agentId: ctx.agentId,
              agentName: ctx.agentName,
              toolName: event.name,
              toolCallId: event.toolCallId,
              args: event.args,
            },
          },
        });
        return;
      }

      // Final turn.status is emitted by runAgentTurn from the authoritative
      // CliAgentResult.reason, not from this event.
      case 'turn_completed':
        return;

      // Surfaced via the thrown error + failure finalization in runAgentTurn.
      case 'error':
        return;
    }
  };
}
