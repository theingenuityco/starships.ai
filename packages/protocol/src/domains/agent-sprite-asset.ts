export type AgentSpriteAssetStatus = 'draft' | 'published' | 'rejected'

/**
 * Registry row for an agent's in-game sprite assets.
 *
 * This is an **offline** pipeline: assets are generated/reviewed/published outside gameplay,
 * then resolved at runtime via `appearanceKey`.
 */
export interface AgentSpriteAssetModel {
  id: string
  agentId: string
  /** Hash tying look to avatar + generator config. */
  appearanceKey: string
  /** The avatar this appearanceKey was derived from (changes invalidate the look). */
  avatarAttachmentId?: string | null

  /** If stored as attachments (S3-backed). */
  spritesheetAttachmentId?: string | null
  atlasAttachmentId?: string | null

  /** If stored as static assets under client `public/` (CDN-friendly). */
  staticBasePath?: string | null

  status: AgentSpriteAssetStatus
  styleId: string
  modelVersion: string
  generatorVersion: string

  createdAt: string
  updatedAt: string
}

export type CreateAgentSpriteAssetRequest = {
  styleId?: string
  modelVersion?: string
  generatorVersion?: string
  /** Optional: override derived appearanceKey (advanced). */
  appearanceKey?: string
  /** Where the runtime should load assets from (static vs attachments). */
  staticBasePath?: string | null
}

export type PublishAgentSpriteAssetRequest = {
  spritesheetAttachmentId?: string | null
  atlasAttachmentId?: string | null
  staticBasePath?: string | null
}

