import { asyncHandler } from '@/middleware/errorHandler';
import { WaitlistService } from '@/services/WaitlistService';
import { logger } from '@/utils/logger';
import { handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { getConnection, WaitlistRepository } from '@starships/models';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const WaitlistCheckSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters'),
});

// Helper function for Zod validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
};

// Initialize waitlist service with proper error handling
const getWaitlistService = () => {
  try {
    const connection = getConnection();
    const waitlistRepo = new WaitlistRepository(connection);
    return new WaitlistService(waitlistRepo);
  } catch (error) {
    logger.error('Failed to get WaitlistRepository:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Waitlist service is temporarily unavailable');
  }
};

// POST /waitlist/check - Check if an email is approved for early access (OpenAPI pattern)
router.post(
  '/waitlist/check',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const bodyValidation = validateData(WaitlistCheckSchema, req.body, res, 'waitlist check data');
      if (!bodyValidation) return;

      const { email } = bodyValidation;

      // Use service to check approval
      let waitlistService;
      try {
        waitlistService = getWaitlistService();
      } catch (error) {
        logger.error('Failed to initialize waitlist service:', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        sendError(res, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable. Please try again.', 503);
        return;
      }

      const result = await waitlistService.checkApproval(email);

      if (result.isApproved) {
        // Set session cookie for approved users
        res.cookie('waitlist_validated', email.toLowerCase().trim(), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      sendSuccess(res, result);
    } catch (error) {
      logger.error('Error checking waitlist approval', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (!handleCommonError(error, res, 'checking waitlist approval')) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Service temporarily unavailable. Please try again.');
      }
    }
  })
);

// GET /waitlist/status - Check current session status (OpenAPI pattern)
router.get('/waitlist/status', (req: Request, res: Response): void => {
  try {
    const validatedEmail = req.cookies?.waitlist_validated;

    if (validatedEmail) {
      sendSuccess(res, {
        isValidated: true,
        email: validatedEmail,
      });
      return;
    }

    sendSuccess(res, {
      isValidated: false,
    });
  } catch (error) {
    logger.error('Error checking waitlist status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (!handleCommonError(error, res, 'checking waitlist status')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to check session status');
    }
  }
});

// POST /waitlist/logout - Clear waitlist session (OpenAPI pattern)
router.post('/waitlist/logout', (req: Request, res: Response): void => {
  try {
    res.clearCookie('waitlist_validated');

    sendSuccess(res, {
      success: true,
      message: 'Session cleared',
    });
  } catch (error) {
    logger.error('Error clearing waitlist session', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (!handleCommonError(error, res, 'clearing waitlist session')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to clear session');
    }
  }
});

export default router;
