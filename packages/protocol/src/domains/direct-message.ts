export type DirectMessageType = 'user_agent' | 'user_user';

/**
 * Conversation-backed direct message.
 *
 * - `conversationId` is the backing conversation.
 * - `dmType` selects which peer fields are present.
 */
export interface DirectMessage {
  conversationId: string;
  starshipId: string;
  dmType: DirectMessageType;

  // user↔agent
  userId?: string | null;
  agentId?: string | null;

  // user↔user (normalized pair userAId < userBId)
  userAId?: string | null;
  userBId?: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface DirectMessageModel extends DirectMessage {}
