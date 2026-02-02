import type { MessageModel } from '../domains/message';

export type TurnStatus = 'active' | 'waiting_for_tools' | 'completed' | 'failed' | 'cancelled';

export type ConversationStreamSnapshot = {
  conversationId: string;
  messages: MessageModel[];
  /**
   * Optional: best-effort per-turn usage map (keyed by turnId) for recent turns.
   * Used to restore token usage UI (e.g. avatar rings) after refresh/reconnect.
   */
  turnUsageByTurnId?: Record<
    string,
    {
      turnId: string;
      at: string;
      agentId?: string;
      agentName?: string;
      model?: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };
    }
  >;
  /**
   * If true, there are older persisted messages before `oldestCursor`.
   */
  hasMoreBefore?: boolean;
  /**
   * Cursor for loading older messages (oldest message in the snapshot window).
   */
  oldestCursor?: { createdAt: string; id: string } | null;
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

/**
 * Provider/model usage for a specific LLM call inside a turn.
 *
 * This is emitted as soon as the provider reports usage (typically on content_complete).
 * It is intended for **UX/debug** only (e.g. showing a context utilization ring on the agent avatar).
 */
export type ConversationStreamTurnUsage = {
  conversationId: string;
  turnId: string;
  at: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
};

// ----------------------------------------------------------------------------
// UI Actions (server → client hints over SSE)
// ----------------------------------------------------------------------------

export type ToolApprovalRequiredUIAction = {
  action: 'tool_approval_required';
  payload: {
    approvalId: string;
    conversationId: string;
    starshipId: string;
    agentId?: string;
    agentName?: string;
    toolId?: string;
    toolSlug?: string;
    toolCallId?: string;
    args?: Record<string, unknown>;
  };
};

export type ToolApprovalResolvedUIAction = {
  action: 'tool_approval_resolved';
  payload: {
    approvalId: string;
    conversationId: string;
    starshipId?: string;
    status?: 'approved' | 'denied';
  };
};

export type ConversationTitleUpdatedUIAction = {
  action: 'conversation_title_updated';
  payload: {
    conversationId: string;
    starshipId?: string;
    title?: string;
  };
};

export type ChildConversationCreatedUIAction = {
  action: 'child_conversation_created';
  payload: {
    parentConversationId: string;
    childConversationId: string;
    starshipId: string;
  };
};

export type OnboardingConnectorsUIAction = {
  action: 'onboarding_connectors';
  payload: {
    conversationId: string;
    providers: string[];
  };
};

/**
 * Union of known UI actions, plus a forward-compatible fallback.
 */
export type ConversationStreamUIAction =
  | ToolApprovalRequiredUIAction
  | ToolApprovalResolvedUIAction
  | ConversationTitleUpdatedUIAction
  | ChildConversationCreatedUIAction
  | OnboardingConnectorsUIAction
  | { action: string; payload?: Record<string, unknown> };

export type ConversationStreamEvent =
  | { type: 'snapshot'; data: ConversationStreamSnapshot }
  | { type: 'turn.started'; data: ConversationStreamTurnStarted }
  | { type: 'turn.status'; data: ConversationStreamTurnStatus }
  | { type: 'turn.usage'; data: ConversationStreamTurnUsage }
  | { type: 'assistant.delta'; data: ConversationStreamAssistantDelta }
  | { type: 'assistant.reasoning_delta'; data: ConversationStreamAssistantReasoningDelta }
  | { type: 'message.append'; data: ConversationStreamMessageAppend }
  | { type: 'ui_action'; data: ConversationStreamUIAction };
