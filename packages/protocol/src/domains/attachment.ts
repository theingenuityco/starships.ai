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
 * Text files: Content extracted and appended to message text
 */
export const ALLOWED_MIME_TYPES = [
  // Images (via image_url blocks)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents (via file blocks - OpenRouter only supports PDFs)
  'application/pdf',
  // Text files (extracted and appended to message)
  'text/plain',           // .txt
  'text/markdown',        // .md
  'text/csv',             // .csv
  'text/html',            // .html
  'text/css',             // .css
  'text/xml',             // .xml
  // Application text formats
  'application/json',     // .json
  'application/xml',      // .xml (alternative)
  'application/x-yaml',   // .yaml, .yml
  // Code files
  'text/javascript',      // .js
  'text/x-python',        // .py
  'text/x-java-source',   // .java
  'text/x-c',             // .c
  'text/x-c++',           // .cpp
  'application/typescript', // .ts
  'text/x-go',            // .go
  'text/x-rust',          // .rs
  'text/x-ruby',          // .rb
  'text/x-php',           // .php
  'text/x-swift',         // .swift
] as const;

/**
 * File size limits
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_IMAGE_DIMENSION = 1568; // Max dimension for optimization
export const MAX_TEXT_FILE_SIZE = 500 * 1024; // 500KB per text file (to avoid context overflow)

/**
 * Helper function to check if MIME type is text-based
 */
export function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/x-yaml' ||
    mimeType === 'application/typescript'
  );
}
