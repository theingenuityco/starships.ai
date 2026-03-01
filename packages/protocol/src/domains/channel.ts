/**
 * Channel Domain Types
 *
 * Channels are conversation-backed rooms (Slack/Discord-like) within a starship.
 */

export type ChannelType = 'chat';

export interface Channel {
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string | null;
  /**
   * Optional view attached/pinned to this channel (e.g. a dashboard layout).
   * Null/undefined means no attached view.
   */
  attachedViewId?: string | null;
  /**
   * Optional on create; defaults to `chat` server-side.
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
