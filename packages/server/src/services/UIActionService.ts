import type { ConversationStreamUIAction } from '@starships/protocol';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';

type UIActionPayload = ConversationStreamUIAction | { action: string; payload?: Record<string, unknown> };

/**
 * UIActionService
 *
 * Centralizes emitting UI actions over the conversation stream so routes/services
 * don't interact with ConversationStreamBus directly.
 */
export class UIActionService {
  private readonly bus: ConversationStreamBus;

  constructor(bus?: ConversationStreamBus) {
    this.bus = bus ?? ConversationStreamBus.getInstance();
  }

  async publish(conversationId: string, payload: UIActionPayload): Promise<void> {
    if (!conversationId || typeof conversationId !== 'string') return;
    if (!payload || typeof payload !== 'object') return;
    const action = (payload as any).action;
    if (typeof action !== 'string' || action.trim().length === 0) return;

    try {
      await this.bus.publish(conversationId, { type: 'ui_action', data: payload as ConversationStreamUIAction });
    } catch {
      // best-effort only; never throw to callers
    }
  }

  async publishAction(conversationId: string, action: string, payload?: Record<string, unknown>): Promise<void> {
    if (!action || typeof action !== 'string') return;
    const trimmed = action.trim();
    if (!trimmed) return;
    await this.publish(conversationId, { action: trimmed, ...(payload ? { payload } : null) });
  }
}

