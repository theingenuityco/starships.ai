import { Router } from 'express';
import type { Request, Response } from 'express';
import { WaitlistRepository, getConnection } from '@starships/models';
import { WaitlistService } from '@/services/WaitlistService';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/middleware/errorHandler';
import { sendSuccess, sendError, handleCommonError } from '@/utils/responseHelpers';

const router: Router = Router();

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
      const { email } = req.body;

      // Validate input
      if (!email || typeof email !== 'string') {
        sendError(res, 'MISSING_REQUIRED_FIELD', 'Please provide a valid email address', 400, {
          field: 'email',
          provided: typeof email,
        });
        return;
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        sendError(res, 'VALIDATION_ERROR', 'Please provide a valid email address', 400, {
          field: 'email',
          constraint: 'email_format',
        });
        return;
      }

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
