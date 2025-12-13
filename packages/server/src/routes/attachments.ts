/**
 * Attachment Routes
 *
 * API endpoints for file attachment management.
 * Handles upload, retrieval, and deletion.
 *
 * SECURITY: S3 URLs never exposed to client - only used server-side for LLM processing
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { AttachmentService } from '@/services/AttachmentService';
import { ConversationRepository } from '@starships/models';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';

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
 * Helper: Check authentication
 */
const checkAuth = (req: Request, res: Response): boolean => {
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
  async (req: Request, res: Response): Promise<void> => {
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
router.get('/attachments/:attachmentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/attachments', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.get('/attachments/:attachmentId/preview', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.delete('/attachments/:attachmentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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

export default router;
