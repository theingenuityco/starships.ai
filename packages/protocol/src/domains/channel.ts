/**
 * Channel Domain Types
 *
 * Channels are conversation-backed rooms (Slack/Discord-like) within a starship.
 */

export type ChannelType = 'chat' | 'forum';

export interface Channel {
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string | null;
  /**
   * Optional on create; defaults to `chat` server-side.
   * `forum` channels render as thread/card indexes (Discord-forum style).
   */
  channelType?: ChannelType;
}

/**
 * Core channel model - database entity
 *
 * NOTE: `conversationId` is the channel identifier; it references `conversations.id`.
 */
export interface ChannelModel extends Channel {
  conversationId: string;
  starshipId: string;
  channelType: ChannelType;
  createdAt: string;
  updatedAt: string;
}
