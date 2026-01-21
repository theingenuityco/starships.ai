/**
 * Attachment Routes
 *
 * API endpoints for file attachment management.
 * Handles upload, retrieval, and deletion.
 *
 * SECURITY: S3 URLs never exposed to client - only used server-side for LLM processing
 */

import { Router } from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { AttachmentService } from '@/services/AttachmentService';
import { ConversationRepository } from '@starships/models';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { isIP } from 'node:net';

const router: Router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

// Validation schemas
const ConversationIdSchema = z.object({
  conversationId: IdSchema,
});

const AttachmentIdSchema = z.object({
  attachmentId: IdSchema,
});

/**
 * POST /api/v1/uploads/presigned-url
 *
 * Upload a Starships attachment (stored in S3) to an external presigned URL.
 *
 * Intended for use via the internal `starships` connector template (connector_action),
 * so workflows/agents can move an existing attachment to a third-party destination
 * without exposing raw bytes in tool args.
 */
const PresignedUploadBodySchema = z
  .object({
  // Optional explicit starshipId; if omitted, we fall back to JWT authContext.starshipId.
  starshipId: z
    .preprocess((v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v), IdSchema.optional())
    .optional(),
  attachmentId: IdSchema,
  presignedUrl: z.string().trim().min(1).max(8192),
  /**
   * Upload HTTP method.
   * - Most object-storage presigned uploads use PUT
   * - Some providers use POST with form fields
   */
  method: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(['PUT', 'POST']).default('PUT')),
  // Optional override; many presigned PUT URLs require the content-type to match signature.
  contentType: z
    .preprocess((v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v), z.string().trim().max(255).optional())
    .optional(),
  // Optional extra headers required by the presigned URL (e.g. x-amz-acl).
  headers: z.record(z.string(), z.string()).optional(),
  /**
   * Optional form fields for multipart presigned uploads (S3-style).
   * These are used when bodyMode="multipart".
   */
  fields: z.record(z.string(), z.string()).optional(),
  /**
   * Optional file field name for multipart presigned uploads.
   * Defaults to "file".
   */
  fileFieldName: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.string().trim().min(1).max(128).optional()
  ),
  /**
   * Body mode is an explicit, independent switch that controls how the upload is encoded.
   * - raw: send the file bytes as the request body
   * - multipart: send multipart/form-data (S3-style presigned POST)
   *
   * If omitted, we keep backwards compatibility by inferring multipart when
   * fields or fileFieldName are provided; otherwise raw.
   */
  bodyMode: z.enum(['raw', 'multipart']),
})
  .superRefine((val, ctx) => {
    if (val.bodyMode === 'raw') {
      if (val.fields && Object.keys(val.fields).length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fields is only allowed when bodyMode="multipart"', path: ['fields'] });
      }
      if (val.fileFieldName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fileFieldName is only allowed when bodyMode="multipart"',
          path: ['fileFieldName'],
        });
      }
    }
    if (val.bodyMode === 'multipart') {
      if (!val.fileFieldName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'fileFieldName is required when bodyMode="multipart"',
          path: ['fileFieldName'],
        });
      }
    }
  });

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;

  // Common local hostnames
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;

  // Block direct IP literals that are private/link-local/loopback.
  const ipVersion = isIP(h);
  if (ipVersion === 4) {
    const parts = h.split('.').map((x) => parseInt(x, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;

    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 0 || a === 10 || a === 127) return true;
    // 169.254.0.0/16 (link-local), 192.168.0.0/16
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipVersion === 6) {
    // Loopback, link-local, and unique local addresses
    if (h === '::1') return true;
    if (h.startsWith('fe80:')) return true; // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local (fc00::/7)
    return false;
  }

  // Hostname (not an IP). We can't safely resolve DNS here without risk of DNS rebinding.
  // Still block obvious local-like patterns.
  return false;
}

function validateExternalPresignedUrl(raw: string): { ok: true; url: URL } | { ok: false; message: string } {
  const value = String(raw || '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: 'presignedUrl must be a valid URL' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: 'presignedUrl must start with http:// or https://' };
  }
  if (!url.hostname) {
    return { ok: false, message: 'presignedUrl must include a hostname' };
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    return { ok: false, message: 'presignedUrl hostname is not allowed' };
  }
  return { ok: true, url };
}

/**
 * Helper: Check authentication
 */
const checkAuth = (req: ExpressRequest, res: ExpressResponse): boolean => {
  if (!req.user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

/**
 * Helper: Get starship ID from conversation
 */
async function getStarshipIdFromConversation(conversationId: string): Promise<string | null> {
  const conversationRepo = new ConversationRepository();
  const conversation = await conversationRepo.findById(conversationId);
  return conversation?.starshipId || null;
}

/**
 * POST /api/v1/conversations/:conversationId/attachments
 * Upload file attachment
 */
router.post(
  '/conversations/:conversationId/attachments',
  jwtAuthMiddleware,
  upload.single('file'),
  async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    try {
      // Authentication check
      if (!checkAuth(req, res)) return;

      // Validate conversation ID
      const paramValidation = validateData(ConversationIdSchema, req.params, res, 'conversation parameter');
      if (!paramValidation) return;

      const { conversationId } = paramValidation;

      // Check if file exists
      if (!req.file) {
        sendError(res, 'VALIDATION_ERROR', 'No file provided', 400);
        return;
      }

      // Get starship ID from conversation
      const starshipId = await getStarshipIdFromConversation(conversationId);
      if (!starshipId) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Conversation not found', 404);
        return;
      }

      // Authorization: verify user has access to this conversation's starship
      const authUserId = req.user!.id;
      if (!(await verifyResourceAccess(starshipId, authUserId, 'conversation', conversationId, res))) {
        return;
      }

      // Create attachment
      const service = new AttachmentService();
      const attachment = await service.createAttachment({
        starshipId,
        conversationId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });

      sendSuccess(res, attachment, 201);
    } catch (error: any) {
      handleError(error, res, 'uploading file');
    }
  }
);

/**
 * GET /api/v1/attachments/:attachmentId
 * Get attachment with presigned URL
 */
router.get('/attachments/:attachmentId', jwtAuthMiddleware, async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate attachment ID
    const paramValidation = validateData(AttachmentIdSchema, req.params, res, 'attachment parameter');
    if (!paramValidation) return;

    const { attachmentId } = paramValidation;

    // Get starship ID from query for access control
    const starshipId = req.query.starshipId as string;
    if (!starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter required', 400);
      return;
    }

    // Authorization: verify user has access to this starship
    const authUserId = req.user!.id;
    if (!(await verifyResourceAccess(starshipId, authUserId, 'attachment', attachmentId, res))) {
      return;
    }

    // Get attachment (service validates starship ownership)
    const service = new AttachmentService();
    const attachment = await service.getAttachment(attachmentId, starshipId);

    if (!attachment) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Attachment not found', 404);
      return;
    }

    sendSuccess(res, attachment, 200);
  } catch (error: any) {
    handleError(error, res, 'fetching attachment');
  }
});

/**
 * GET /api/v1/attachments
 * Batch fetch attachment metadata (no S3 URLs)
 * Query params: ids (comma-separated), starshipId
 */
router.get('/attachments', jwtAuthMiddleware, async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Get and validate IDs
    const idsParam = req.query.ids as string;
    const starshipId = req.query.starshipId as string;

    if (!idsParam) {
      sendError(res, 'VALIDATION_ERROR', 'ids query parameter required', 400);
      return;
    }

    if (!starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter required', 400);
      return;
    }

    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      sendSuccess(res, [], 200);
      return;
    }

    // Authorization: verify user has access to this starship
    const authUserId = req.user!.id;
    if (!(await verifyResourceAccess(starshipId, authUserId, 'starship', starshipId, res))) {
      return;
    }

    // Fetch attachments
    const service = new AttachmentService();
    const attachments = await service.getAttachmentsBatch(ids, starshipId);

    sendSuccess(res, attachments, 200);
  } catch (error: any) {
    handleError(error, res, 'fetching attachments');
  }
});

/**
 * GET /api/v1/attachments/:attachmentId/preview
 * Proxy endpoint to fetch image/file data from S3
 * Returns image data directly (security: S3 URL never exposed to client)
 */
router.get('/attachments/:attachmentId/preview', jwtAuthMiddleware, async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate attachment ID
    const paramValidation = validateData(AttachmentIdSchema, req.params, res, 'attachment parameter');
    if (!paramValidation) return;

    const { attachmentId } = paramValidation;

    // Get starship ID for access control
    const starshipId = req.query.starshipId as string;
    if (!starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter required', 400);
      return;
    }

    // Authorization: verify user has access to this starship
    const authUserId = req.user!.id;
    if (!(await verifyResourceAccess(starshipId, authUserId, 'attachment', attachmentId, res))) {
      return;
    }

    // Get attachment with presigned URL (internal use)
    const service = new AttachmentService();
    const attachment = await service.getAttachmentWithUrl(attachmentId, starshipId);

    if (!attachment) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Attachment not found', 404);
      return;
    }

    // Fetch file from S3 and stream to client
    const response = await fetch(attachment.url);
    if (!response.ok) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Failed to fetch file from storage', 500);
      return;
    }

    // Set appropriate headers
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

    // Stream response
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error: any) {
    handleError(error, res, 'fetching attachment preview');
  }
});

/**
 * DELETE /api/v1/attachments/:attachmentId
 * Delete attachment
 */
router.delete('/attachments/:attachmentId', jwtAuthMiddleware, async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate attachment ID
    const paramValidation = validateData(AttachmentIdSchema, req.params, res, 'attachment parameter');
    if (!paramValidation) return;

    const { attachmentId } = paramValidation;

    // Get starship ID for ownership verification
    const starshipId = req.query.starshipId as string;
    if (!starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'starshipId query parameter required', 400);
      return;
    }

    // Authorization: verify user has access to this starship
    const authUserId = req.user!.id;
    if (!(await verifyResourceAccess(starshipId, authUserId, 'attachment', attachmentId, res))) {
      return;
    }

    // Delete attachment (service validates starship ownership)
    const service = new AttachmentService();
    const deleted = await service.deleteAttachment(attachmentId, starshipId);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Attachment not found', 404);
      return;
    }

    sendSuccess(res, { message: 'Attachment deleted successfully' }, 200);
  } catch (error: any) {
    handleError(error, res, 'deleting attachment');
  }
});

/**
 * POST /api/v1/uploads/presigned-url
 * Upload an existing Starships attachment to an external presigned URL.
 */
router.post('/uploads/presigned-url', jwtAuthMiddleware, async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const body = validateData(PresignedUploadBodySchema, req.body ?? {}, res, 'presigned upload payload');
    if (!body) return;

    const userId = req.user!.id;
    const starshipId =
      (typeof body.starshipId === 'string' && body.starshipId.trim().length > 0 ? body.starshipId.trim() : undefined) ??
      (typeof req.authContext?.starshipId === 'string' ? String(req.authContext.starshipId).trim() : undefined);

    if (!starshipId) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'starshipId is required (or must be present in auth context)', 400, {
        field: 'starshipId',
      });
      return;
    }

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const presignedCheck = validateExternalPresignedUrl(body.presignedUrl);
    if (!presignedCheck.ok) {
      sendError(res, 'VALIDATION_ERROR', presignedCheck.message, 400, { field: 'presignedUrl' });
      return;
    }

    const attachmentService = new AttachmentService();
    const attachment = await attachmentService.getAttachmentWithUrl(body.attachmentId, starshipId);
    if (!attachment) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Attachment not found', 404, { attachmentId: body.attachmentId });
      return;
    }

    // Download bytes from our storage using an internal presigned URL (short-lived).
    const downloadController = new AbortController();
    const downloadTimeoutId = setTimeout(() => downloadController.abort(), 30000);
    let bytes: ArrayBuffer;
    try {
      const resp = await fetch(attachment.url, { method: 'GET', signal: downloadController.signal });
      if (!resp.ok) {
        sendError(res, 'SERVICE_UNAVAILABLE', 'Failed to fetch attachment bytes from storage', 502, {
          attachmentId: body.attachmentId,
          status: resp.status,
          statusText: resp.statusText,
        });
        return;
      }
      const ab = await resp.arrayBuffer();
      bytes = ab;
    } finally {
      clearTimeout(downloadTimeoutId);
    }

    // Upload bytes to the external presigned URL.
    const uploadHeaders: Record<string, string> = {};
    const extraHeaders = body.headers && typeof body.headers === 'object' ? body.headers : {};
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (typeof k !== 'string' || !k.trim()) continue;
      if (typeof v !== 'string') continue;
      uploadHeaders[k] = v;
    }

    const method = String(body.method ?? 'PUT').toUpperCase();

    // Independent upload config: decide body encoding explicitly when possible.
    // Backwards-compat inference only when bodyMode is omitted.
    const bodyMode = body.bodyMode;

    const contentTypeFromArg = typeof body.contentType === 'string' && body.contentType.trim().length > 0 ? body.contentType.trim() : undefined;
    const contentTypeFromHeader = uploadHeaders['Content-Type'] || uploadHeaders['content-type'];
    const effectiveContentType = contentTypeFromArg ?? contentTypeFromHeader ?? attachment.mimeType;

    // Only set Content-Type automatically when the caller explicitly provides it.
    // Presigned URLs often include header constraints; guessing can break signature validation.
    if (contentTypeFromArg && bodyMode === 'raw') {
      uploadHeaders['Content-Type'] = contentTypeFromArg;
    }

    const uploadController = new AbortController();
    const uploadTimeoutId = setTimeout(() => uploadController.abort(), 60000);
    let uploadBodySnippet: string | undefined;
    try {
      let uploadResp: globalThis.Response;
      if (bodyMode === 'multipart') {
        const form = new FormData();
        const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
        for (const [k, v] of Object.entries(fields)) {
          if (typeof k !== 'string' || !k.trim()) continue;
          if (typeof v !== 'string') continue;
          form.append(k, v);
        }

        const fileFieldName = body.fileFieldName;
        // Wrap bytes as Blob so filename + content-type are carried.
        form.append(fileFieldName!, new Blob([bytes], { type: effectiveContentType }), attachment.filename);

        uploadResp = await fetch(presignedCheck.url.toString(), {
          method,
          headers: uploadHeaders,
          body: form,
          signal: uploadController.signal,
        });
      } else {
        uploadResp = await fetch(presignedCheck.url.toString(), {
          method,
          headers: uploadHeaders,
          body: bytes,
          signal: uploadController.signal,
        });
      }
      if (!uploadResp.ok) {
        try {
          const t = await uploadResp.text();
          uploadBodySnippet = t.length > 2000 ? `${t.slice(0, 2000)}…` : t;
        } catch {
          uploadBodySnippet = undefined;
        }

        sendError(res, 'SERVICE_UNAVAILABLE', 'Presigned upload failed', 502, {
          status: uploadResp.status,
          statusText: uploadResp.statusText,
          responseBodySnippet: uploadBodySnippet,
          destination: { host: presignedCheck.url.host, path: presignedCheck.url.pathname },
        });
        return;
      }

      sendSuccess(res, {
        ok: true,
        attachmentId: body.attachmentId,
        bytesUploaded: bytes.byteLength,
        method,
        bodyMode,
        ...(contentTypeFromArg ? { contentType: contentTypeFromArg } : {}),
        destination: { host: presignedCheck.url.host, path: presignedCheck.url.pathname },
        response: { status: uploadResp.status, statusText: uploadResp.statusText },
      });
      return;
    } finally {
      clearTimeout(uploadTimeoutId);
    }
  } catch (error: unknown) {
    handleError(error, res, 'uploading attachment to presigned url');
  }
});

export default router;
