/**
 * S3 Storage Helper
 *
 * Handles file uploads, downloads, and presigned URL generation for AWS S3.
 * Uses AWS SDK v3 for modular imports and better tree-shaking.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnvConfig } from '@starships/env';

const env = getEnvConfig();

// Lazy S3 client initialization
let s3Client: S3Client | null = null;

/**
 * Get or create S3 client instance
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    // Use explicit credentials if provided, otherwise fall back to default credential chain
    // (EC2 instance role, ECS task role, environment variables, etc.)
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      s3Client = new S3Client({
        region: env.AWS_S3_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      s3Client = new S3Client({
        region: env.AWS_S3_REGION,
      });
    }
  }
  return s3Client;
}

/**
 * Upload options
 */
export interface UploadOptions {
  starshipId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Upload file to S3
 *
 * Key format: starship-{starshipId}/conv-{conversationId}/{timestamp}_{filename}
 * Files are organized by conversation, messageId relationship stored in database
 *
 * @returns S3 key for the uploaded file
 */
export async function uploadToS3(options: UploadOptions): Promise<string> {
  const { starshipId, conversationId, filename, mimeType, buffer } = options;

  // Generate S3 key with readable prefixes
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const s3Key = `starship-${starshipId}/conv-${conversationId}/${timestamp}_${sanitizedFilename}`;

  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
    // Private ACL - only accessible via presigned URLs
    // Note: Modern S3 uses bucket policies instead of ACL
  });

  await getS3Client().send(command);

  return s3Key;
}

/**
 * Generate presigned URL for file download
 *
 * @param s3Key - S3 object key
 * @param expiresIn - Expiration time in seconds (default: 1 minute)
 * @returns Presigned URL valid for specified duration
 */
export async function generatePresignedUrl(s3Key: string, expiresIn = 60): Promise<string> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  // Extract filename from S3 key for download
  const filename = s3Key.split('/').pop() || 'download';

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    // Force download instead of preview for all file types
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

/**
 * Generate presigned URL for inline preview (e.g. images).
 *
 * @param s3Key - S3 object key
 * @param expiresIn - Expiration time in seconds (default: 1 minute)
 */
export async function generatePresignedUrlInline(s3Key: string, expiresIn = 60): Promise<string> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  const filename = s3Key.split('/').pop() || 'preview';

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ResponseContentDisposition: `inline; filename="${filename}"`,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}

/**
 * Upload a public avatar image for an agent template.
 * These are served via API routes and stored in S3 under a stable prefix.
 */
export async function uploadAgentTemplateAvatarToS3(options: {
  templateId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<string> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  const timestamp = Date.now();
  const sanitizedFilename = options.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const s3Key = `public/agent-templates/${options.templateId}/avatar_${timestamp}_${sanitizedFilename}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: options.buffer,
    ContentType: options.mimeType,
  });

  await getS3Client().send(command);
  return s3Key;
}

/**
 * Delete file from S3
 *
 * @param s3Key - S3 object key to delete
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  await getS3Client().send(command);
}

/**
 * Fetch text content from S3
 *
 * @param s3Key - S3 object key to fetch
 * @returns Text content as UTF-8 string
 */
export async function fetchTextFromS3(s3Key: string): Promise<string> {
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  const response = await getS3Client().send(command);

  if (!response.Body) {
    throw new Error('Empty response from S3');
  }

  // Convert stream to buffer, then to UTF-8 string
  const chunks: Uint8Array[] = [];
  // AWS SDK body is a stream that yields Uint8Array chunks
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return buffer.toString('utf-8');
}

/**
 * Sanitize filename for S3 storage
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}
