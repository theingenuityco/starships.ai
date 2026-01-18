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

// ----------------------------------------------------------------------------
// UI Actions (server → client hints over SSE)
// ----------------------------------------------------------------------------

export type ToolApprovalRequiredUIAction = {
  __ui_action: 'tool_approval_required';
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

export type ToolApprovalResolvedUIAction = {
  __ui_action: 'tool_approval_resolved';
  approvalId: string;
  conversationId: string;
  starshipId?: string;
};

export type ConversationTitleUpdatedUIAction = {
  __ui_action: 'conversation_title_updated';
  conversationId: string;
  starshipId?: string;
  title?: string;
};

export type ChildConversationCreatedUIAction = {
  __ui_action: 'child_conversation_created';
  parentConversationId: string;
  childConversationId: string;
  starshipId: string;
};

export type OnboardingConnectorsUIAction = {
  __ui_action: 'onboarding_connectors';
  conversationId: string;
  providers: string[];
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
  | ({ __ui_action: string } & Record<string, unknown>);

export type ConversationStreamEvent =
  | { type: 'snapshot'; data: ConversationStreamSnapshot }
  | { type: 'turn.started'; data: ConversationStreamTurnStarted }
  | { type: 'turn.status'; data: ConversationStreamTurnStatus }
  | { type: 'assistant.delta'; data: ConversationStreamAssistantDelta }
  | { type: 'assistant.reasoning_delta'; data: ConversationStreamAssistantReasoningDelta }
  | { type: 'message.append'; data: ConversationStreamMessageAppend }
  | { type: 'ui_action'; data: ConversationStreamUIAction };
