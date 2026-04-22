/**
 * Marketing Content Domain Types
 *
 * Unified storage for marketing content (images + text) across entity types.
 * Supports pipeline generation tracking and sparse data model.
 */

// ============================================================================
// MARKETING CONTENT TYPES
// ============================================================================

/**
 * Entity types that can have marketing content
 */
export type MarketingContentEntityType = 'agent' | 'connector_template';

/**
 * Content types for marketing content
 */
export type MarketingContentType =
  // Images
  | 'avatar'
  | 'problem_statements_image'
  | 'capabilities_image'
  | 'try_these_prompts_image'
  // Text
  | 'problem_statements_text'
  // Future: 'hero_image' | 'demo_video' | 'social_preview' | etc.

/**
 * Content format discriminator
 */
export type MarketingContentFormat = 'image' | 'text' | 'video' | 'other';

/**
 * Text format for text content
 */
export type MarketingContentTextFormat = 'json' | 'markdown' | 'html' | 'plain';

/**
 * Generation status for pipeline tracking
 */
export type MarketingContentGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';

/**
 * Core marketing content model
 */
export interface MarketingContentModel {
  id: string;

  // Polymorphic entity reference
  entityType: MarketingContentEntityType;
  entityId: string;

  // Content classification
  contentType: MarketingContentType;
  contentFormat: MarketingContentFormat;

  // Storage (for images/videos)
  s3Key?: string;
  mimeType?: string;

  // Text content (for text format)
  textContent?: string; // JSON.stringify(['statement1', 'statement2', ...]) for arrays
  textFormat?: MarketingContentTextFormat;

  // Generation pipeline tracking
  generationStatus: MarketingContentGenerationStatus;
  generationRequestedAt?: string;
  generationStartedAt?: string;
  generationCompletedAt?: string;
  generationError?: string;

  // Generation metadata (for pipeline tracking)
  generationMetadata?: Record<string, unknown>; // { model: '...', prompt_version: '...', retry_count: 2, cost_usd: 0.002 }

  // Display metadata (for SEO, alt text, etc.)
  metadata?: Record<string, unknown>; // { alt_text: '...', caption: '...', seo_keywords: [...], dimensions: {...} }

  // Versioning
  version: number;
  isActive: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create marketing content
 */
export interface CreateMarketingContentRequest {
  entityType: MarketingContentEntityType;
  entityId: string;
  contentType: MarketingContentType;
  contentFormat: MarketingContentFormat;
  s3Key?: string;
  mimeType?: string;
  textContent?: string;
  textFormat?: MarketingContentTextFormat;
  generationMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update marketing content
 */
export interface UpdateMarketingContentRequest {
  s3Key?: string;
  mimeType?: string;
  textContent?: string;
  textFormat?: MarketingContentTextFormat;
  generationStatus?: MarketingContentGenerationStatus;
  generationRequestedAt?: string;
  generationStartedAt?: string;
  generationCompletedAt?: string;
  generationError?: string;
  generationMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}
