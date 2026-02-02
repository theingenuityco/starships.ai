export type ConversationReadStateModel = {
  conversationId: string;
  userId: string;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  updatedAt: string;
};

