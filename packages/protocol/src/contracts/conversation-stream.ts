import type { MessageModel } from '../domains/message';

export type TurnStatus = 'active' | 'waiting_for_tools' | 'completed' | 'failed' | 'cancelled';

export type ConversationStreamSnapshot = {
  conversationId: string;
  messages: MessageModel[];
  /**
   * Latest known turn for this conversation (server authoritative).
   * When null, no turn exists yet.
   */
  turn: { turnId: string; status: TurnStatus; startedAt?: string; completedAt?: string | null } | null;
};

export type ConversationStreamTurnStarted = {
  conversationId: string;
  turnId: string;
  at: string;
};

export type ConversationStreamTurnStatus = {
  conversationId: string;
  turnId: string;
  status: TurnStatus;
  at: string;
  error?: { code?: string; message: string } | null;
};

export type ConversationStreamAssistantDelta = {
  conversationId: string;
  turnId: string;
  /**
   * Stable assistant message id for this turn (used to accumulate deltas client-side).
   */
  messageId: string;
  /**
   * Content delta to append.
   */
  delta: string;
  /**
   * Current accumulated length after applying this delta (optional, for sanity checks).
   */
  position?: number;
  at: string;
};

export type ConversationStreamAssistantReasoningDelta = {
  conversationId: string;
  turnId: string;
  messageId: string;
  delta: string;
  position?: number;
  at: string;
};

export type ConversationStreamMessageAppend = {
  conversationId: string;
  message: MessageModel;
};

export type ConversationStreamUIAction = Record<string, unknown> & { __ui_action: string };

export type ConversationStreamEvent =
  | { type: 'snapshot'; data: ConversationStreamSnapshot }
  | { type: 'turn.started'; data: ConversationStreamTurnStarted }
  | { type: 'turn.status'; data: ConversationStreamTurnStatus }
  | { type: 'assistant.delta'; data: ConversationStreamAssistantDelta }
  | { type: 'assistant.reasoning_delta'; data: ConversationStreamAssistantReasoningDelta }
  | { type: 'message.append'; data: ConversationStreamMessageAppend }
  | { type: 'ui_action'; data: ConversationStreamUIAction };


