/**
 * Channel Domain Types
 *
 * Channels are conversation-backed rooms (Slack/Discord-like) within a starship.
 */

export interface Channel {
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string | null;
}

/**
 * Core channel model - database entity
 *
 * NOTE: `conversationId` is the channel identifier; it references `conversations.id`.
 */
export interface ChannelModel extends Channel {
  conversationId: string;
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

