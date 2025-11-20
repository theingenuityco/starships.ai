/**
 * Attachment Service
 *
 * Business logic for file attachment management.
 * Handles uploads, validation, image optimization, and security.
 */

import { AttachmentRepository } from '@starships/models';
import type { Attachment, AttachmentModel, AttachmentWithUrl } from '@starships/protocol';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@starships/protocol';
import { uploadToS3, generatePresignedUrl, deleteFromS3 } from '@/utils/s3-helper';
import sharp from 'sharp';

export class AttachmentService {
  private repository: AttachmentRepository;

  constructor() {
    this.repository = new AttachmentRepository();
  }

  /**
   * Upload file and create attachment record
   * Returns metadata only (no S3 URL exposed to client)
   */
  async createAttachment(data: {
    starshipId: string;
    conversationId: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<Attachment> {
    // Validate file size
    if (data.buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(data.mimeType as any)) {
      throw new Error(`File type '${data.mimeType}' not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    let imageWidth: number | undefined;
    let imageHeight: number | undefined;
    let uploadBuffer = data.buffer;

    // Optimize images
    if (data.mimeType.startsWith('image/')) {
      try {
        const metadata = await sharp(data.buffer).metadata();
        imageWidth = metadata.width;
        imageHeight = metadata.height;

        // Resize if too large (>1568px on long edge)
        const maxDimension = Math.max(metadata.width || 0, metadata.height || 0);
        if (maxDimension > 1568) {
          uploadBuffer = await sharp(data.buffer)
            .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

          // Update dimensions after resize
          const resizedMeta = await sharp(uploadBuffer).metadata();
          imageWidth = resizedMeta.width;
          imageHeight = resizedMeta.height;
        }
      } catch (err) {
        // If sharp fails, upload original
        console.error('Image optimization failed:', err);
      }
    }

    // Upload to S3 (conversation-based structure)
    const s3Key = await uploadToS3({
      starshipId: data.starshipId,
      conversationId: data.conversationId,
      filename: data.filename,
      mimeType: data.mimeType,
      buffer: uploadBuffer,
    });

    // Create database record (messageId will be set later via linkToMessage)
    const attachment = await this.repository.create({
      starshipId: data.starshipId,
      messageId: undefined, // Set later when message is sent
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: uploadBuffer.length,
      s3Key,
      imageWidth,
      imageHeight,
    });

    // Return metadata only (no S3 URL to client)
    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      imageWidth: attachment.imageWidth,
      imageHeight: attachment.imageHeight,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Get attachment metadata (client-facing, no S3 URL)
   */
  async getAttachment(id: string, starshipId: string): Promise<Attachment | null> {
    const attachment = await this.repository.findById(id);

    if (!attachment) return null;

    // Security: Verify starship access
    if (attachment.starshipId !== starshipId) {
      throw new Error('Unauthorized access to attachment');
    }

    // Return metadata only (no S3 URL)
    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      imageWidth: attachment.imageWidth,
      imageHeight: attachment.imageHeight,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Get attachment with presigned URL (INTERNAL USE ONLY - for downloads and LLM)
   * Never expose this to client responses
   */
  async getAttachmentWithUrl(id: string, starshipId: string): Promise<AttachmentWithUrl | null> {
    const attachment = await this.repository.findById(id);

    if (!attachment) return null;

    // Security: Verify starship access
    if (attachment.starshipId !== starshipId) {
      throw new Error('Unauthorized access to attachment');
    }

    const url = await generatePresignedUrl(attachment.s3Key);

    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      imageWidth: attachment.imageWidth,
      imageHeight: attachment.imageHeight,
      createdAt: attachment.createdAt,
      url,
      s3Key: attachment.s3Key,
    };
  }

  /**
   * Get multiple attachments metadata with presigned URLs (CLIENT-FACING)
   * Industry standard: Return time-limited presigned URLs for direct browser access
   */
  async getAttachmentsBatch(ids: string[], starshipId: string): Promise<Attachment[]> {
    if (ids.length === 0) return [];

    const attachments = await this.repository.findByIds(ids);

    // Security check - verify all belong to starship
    const unauthorized = attachments.find((a: AttachmentModel) => a.starshipId !== starshipId);
    if (unauthorized) {
      throw new Error('Unauthorized access to attachments');
    }

    // Generate presigned URLs in parallel (15 minute expiry)
    return Promise.all(
      attachments.map(async (a: AttachmentModel) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        imageWidth: a.imageWidth,
        imageHeight: a.imageHeight,
        createdAt: a.createdAt,
        previewUrl: await generatePresignedUrl(a.s3Key, 900), // 15 minutes (900s)
      }))
    );
  }

  /**
   * Get multiple attachments with presigned URLs (INTERNAL USE ONLY - for LLM)
   * Never expose this to client responses
   */
  async getAttachments(ids: string[], starshipId: string): Promise<AttachmentWithUrl[]> {
    if (ids.length === 0) return [];

    const attachments = await this.repository.findByIds(ids);

    // Security check - verify all belong to starship
    const unauthorized = attachments.find((a: AttachmentModel) => a.starshipId !== starshipId);
    if (unauthorized) {
      throw new Error('Unauthorized access to attachments');
    }

    // Generate presigned URLs in parallel (for LLM access only)
    return Promise.all(
      attachments.map(async (a: AttachmentModel) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        imageWidth: a.imageWidth,
        imageHeight: a.imageHeight,
        createdAt: a.createdAt,
        url: await generatePresignedUrl(a.s3Key),
        s3Key: a.s3Key,
      }))
    );
  }

  /**
   * Delete attachment (file + metadata)
   */
  async deleteAttachment(id: string, starshipId: string): Promise<boolean> {
    const attachment = await this.repository.findById(id);

    if (!attachment) return false;

    // Security check
    if (attachment.starshipId !== starshipId) {
      throw new Error('Unauthorized access to attachment');
    }

    // Delete from S3 first
    try {
      await deleteFromS3(attachment.s3Key);
    } catch (err) {
      console.error('Failed to delete from S3:', err);
      // Continue with DB deletion even if S3 fails
    }

    // Delete from database
    return this.repository.delete(id);
  }

  /**
   * Link attachment to message
   * Updates database only - files already organized by conversationId in S3
   */
  async linkToMessage(id: string, messageId: string, starshipId: string): Promise<boolean> {
    const attachment = await this.repository.findById(id);

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Security check
    if (attachment.starshipId !== starshipId) {
      throw new Error('Unauthorized access to attachment');
    }

    // Update database with messageId (no file moving needed)
    return this.repository.linkToMessage(id, messageId);
  }
}
