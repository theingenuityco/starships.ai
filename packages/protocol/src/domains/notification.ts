export type NotificationType = 'dm' | 'mention';

export type NotificationModel = {
  id: string;
  starshipId: string;
  userId: string;
  type: NotificationType;
  conversationId: string;
  messageId?: string | null;
  createdAt: string;
  seenAt?: string | null;
  readAt?: string | null;
};

