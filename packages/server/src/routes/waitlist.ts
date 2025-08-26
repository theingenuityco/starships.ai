import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@starships/models';
import { WaitlistService } from '../services/WaitlistService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router: Router = Router();

// Initialize waitlist service
const getWaitlistService = () => {
  const waitlistRepo = RepositoryFactory.getWaitlistRepository();
  return new WaitlistService(waitlistRepo);
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
    const waitlistService = getWaitlistService();
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
    logger.error('Error checking waitlist approval', { error });
    
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