export type MentionTargetType = 'user' | 'agent';

export type MessageMentionModel = {
  messageId: string;
  conversationId: string;
  starshipId: string;
  targetType: MentionTargetType;
  targetId: string;
  createdAt: string;
};

