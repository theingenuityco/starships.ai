import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@starships/models';
import { WaitlistService } from '../services/WaitlistService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router: Router = Router();

// Initialize waitlist service with proper error handling
const getWaitlistService = () => {
  try {
    const waitlistRepo = RepositoryFactory.getWaitlistRepository();
    return new WaitlistService(waitlistRepo);
  } catch (error) {
    logger.error('Failed to get WaitlistRepository:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Waitlist service is temporarily unavailable');
  }
};

/**
 * POST /api/waitlist/check
 * Check if an email is approved for early access
 */
router.post('/check', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        isApproved: false,
        message: 'Please provide a valid email address'
      });
    }

    // Use service to check approval
    let waitlistService;
    try {
      waitlistService = getWaitlistService();
    } catch (error) {
      logger.error('Failed to initialize waitlist service:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return res.status(503).json({
        isApproved: false,
        message: 'Service temporarily unavailable. Please try again.'
      });
    }
    
    const result = await waitlistService.checkApproval(email);

    if (result.isApproved) {
      // Set session cookie for approved users
      res.cookie('waitlist_validated', email.toLowerCase().trim(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    return res.json(result);

  } catch (error) {
    logger.error('Error checking waitlist approval', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Return generic error message (no information leakage)
    return res.status(500).json({
      isApproved: false,
      message: 'Service temporarily unavailable. Please try again.'
    });
  }
}));

/**
 * GET /api/waitlist/status
 * Check current session status
 */
router.get('/status', (req: Request, res: Response): void => {
  const validatedEmail = req.cookies?.waitlist_validated;
  
  if (validatedEmail) {
    res.json({
      isValidated: true,
      email: validatedEmail
    });
    return;
  }

  res.json({
    isValidated: false
  });
});

/**
 * POST /api/waitlist/logout
 * Clear waitlist session
 */
router.post('/logout', (req: Request, res: Response): void => {
  res.clearCookie('waitlist_validated');
  
  res.json({
    success: true,
    message: 'Session cleared'
  });
});

export default router;