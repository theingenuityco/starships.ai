/**
 * File Attachment Domain Types
 *
 * Defines interfaces for file attachments in conversations.
 * Supports images, PDFs, text files, and other document types.
 */

// Re-export multimodal content types from autopilot (source of truth for LLM types)
export type { ContentBlock, MessageContent } from '@starships/autopilot';

/**
 * Attachment metadata returned to clients
 * SECURITY: Includes time-limited presigned URLs for client display
 * Raw S3 URLs and keys are never exposed - only signed URLs with expiration
 */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: string;
  /** Time-limited presigned S3 URL for client preview (15 minute expiry) */
  previewUrl?: string;
}

/**
 * Complete attachment model with storage details
 */
export interface AttachmentModel extends Attachment {
  starshipId: string;
  messageId?: string;
  s3Key: string;
}

/**
 * Internal: Attachment with presigned URL (server-side only, never sent to client)
 * Used internally for LLM access only
 */
export interface AttachmentWithUrl extends Attachment {
  url: string; // Presigned S3 URL (1 minute expiry) - INTERNAL USE ONLY
  s3Key: string; // S3 key for server operations
}

/**
 * File upload request
 */
export interface UploadAttachmentRequest {
  file: File | Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Allowed MIME types (OpenRouter compatible)
 * Images: Sent as image_url blocks (supported by vision models)
 * PDFs: Sent as file blocks (OpenRouter parses and sends to any model)
 *
 * NOTE: Text files (.txt, .csv, .md, .json) not currently supported
 * TODO: Implement Option 2 - read text files and append to message content
 */
export const ALLOWED_MIME_TYPES = [
  // Images (via image_url blocks)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents (via file blocks - OpenRouter only supports PDFs)
  'application/pdf',
] as const;

/**
 * File size limits
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_IMAGE_DIMENSION = 1568; // Max dimension for optimization
