/**
 * Authentication Routes
 *
 * JWT-based authentication system for user registration, login, and token management
 */

import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { WaitlistService } from '@/services/WaitlistService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { generateJWT, generateOAuthState, validateOAuthState, verifyJWT } from '@/utils/jwt';
import { getEnvConfig } from '@starships/env';
import { getConnection, StarshipRepository, WaitlistRepository } from '@starships/models';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { logger } from '@/utils/logger';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';

const router: Router = Router();
const env = getEnvConfig();

// Initialize waitlist service
const initWaitlistService = () => {
  const waitlistRepo = new WaitlistRepository();
  return new WaitlistService(waitlistRepo);
};

// Zod schemas for validation
const RegisterSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password must be less than 255 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters'),
  password: z.string().min(1, 'Password is required').max(255, 'Password must be less than 255 characters'),
});

// Zod schemas for OAuth validation
const OAuthProviderSchema = z.enum(['google', 'github']);
const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
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

/**
 * Register new user
 * POST /auth/register
 */
router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(RegisterSchema, req.body, res, 'registration data');
    if (!bodyValidation) return;

    const { email, password, name } = bodyValidation;

    // Check if user already exists
    const existingUser = await UserService.getUserByEmail(email);
    if (existingUser) {
      sendError(res, 'RESOURCE_CONFLICT', 'User already exists', 409);
      return;
    }

    // Initialize waitlist service
    const waitlistService = initWaitlistService();

    // Check waitlist status
    const waitlistStatus = await waitlistService.getDetailedStatus(email);

    // If not in waitlist, add as pending
    if (!waitlistStatus.exists) {
      await waitlistService.addToPendingWaitlist(email);
    }

    // Create user regardless of waitlist status (stores credentials for future)
    // User creation happens for both pending and approved users

    // Create user (password will be hashed in UserService)
    const user = await UserService.createUser({
      email,
      password, // Pass plain password - UserService will hash it
      name,
      displayName: name,
    });

    // Check final waitlist status to determine response
    const finalStatus = await waitlistService.getDetailedStatus(email);

    // If user is pending, return waitlist message (don't provide token)
    if (finalStatus.status === 'pending') {
      return sendSuccess(
        res,
        {
          waitlisted: true,
          status: 'pending',
          message: 'Thanks for signing up! Please wait for approval to access the app.',
        },
        200
      );
    }

    // Only create starship and provide token for approved users
    let defaultStarship;
    let defaultAgent;

    if (finalStatus.status === 'approved') {
      try {
        defaultStarship = await StarshipService.createDefaultStarship(user.id);

        // Create default Daedalus agent and host tools from template
        if (defaultStarship) {
          try {
            defaultAgent = await StarshipService.createDefaultAgent(user.id, defaultStarship.id);
          } catch (agentError) {
            console.error(`[AUTH] Failed to create default agent for user ${user.id}:`, agentError);
            // Continue even if agent creation fails
          }
        }
      } catch (error) {
        console.error(`[AUTH] Failed to create default starship for user ${user.id}:`, error);
        // Continue with registration even if starship creation fails
      }
    }

    // Generate JWT token only for approved users
    const token = await generateJWT({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || user.email?.split('@')[0],
          avatar: user.avatar,
        },
        token,
        starship: defaultStarship
          ? {
              id: defaultStarship.id,
              slug: defaultStarship.slug,
              name: defaultStarship.name,
            }
          : null,
        agent: defaultAgent
          ? {
              id: defaultAgent.id,
              name: defaultAgent.name,
              description: defaultAgent.description,
            }
          : null,
      },
      201
    );
  } catch (error: any) {
    logger.error('[AUTH] Registration error:', error);
    handleError(error, res, 'user registration');
  }
});

/**
 * Login user
 * POST /auth/login
 */
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(LoginSchema, req.body, res, 'login data');
    if (!bodyValidation) return;

    const { email, password } = bodyValidation;

    // Get user with password
    const user = await UserService.getUserByEmailWithPassword(email);
    if (!user || !user.password) {
      // Check waitlist status when user doesn't exist
      const waitlistService = initWaitlistService();
      const waitlistStatus = await waitlistService.getDetailedStatus(email);

      if (!waitlistStatus.exists) {
        // Not in system at all
        return sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
      }

      if (waitlistStatus.status === 'pending') {
        // On waitlist but not approved
        return sendSuccess(
          res,
          {
            waitlisted: true,
            status: 'pending',
            message: 'Please wait for approval to access the app.',
          },
          200
        );
      }

      // Approved but no account - suggest registration
      return sendError(res, 'AUTHENTICATION_FAILED', 'No account found. Please sign up first.', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
      return;
    }

    // Check waitlist status for existing user
    const waitlistService = initWaitlistService();
    const waitlistStatus = await waitlistService.getDetailedStatus(email);

    // If user exists but is still pending on waitlist, deny access
    if (waitlistStatus.status === 'pending') {
      return sendSuccess(
        res,
        {
          waitlisted: true,
          status: 'pending',
          message: 'Please wait for approval to access the app.',
        },
        200
      );
    }

    // Get user's starships for redirect purpose
    let firstStarship = null;
    let defaultAgent = null;
    try {
      const starshipRepo = new StarshipRepository();
      const userStarships = await starshipRepo.findByOwner(user.id);
      // Find the first active starship
      firstStarship = userStarships.find((ship: any) => ship.status === 'active') || userStarships[0] || null;

      // If approved user has no starship (was pending when registered), create one now
      if (!firstStarship && waitlistStatus.status === 'approved') {
        logger.info(`[AUTH] Creating starship for newly approved user ${user.email}`);
        try {
          firstStarship = await StarshipService.createDefaultStarship(user.id);

          // Also create default Daedalus agent and host tools
          if (firstStarship) {
            try {
              defaultAgent = await StarshipService.createDefaultAgent(user.id, firstStarship.id);
              logger.info(`[AUTH] Created default agent for user ${user.email}`);
            } catch (agentError) {
              logger.error(`[AUTH] Failed to create default agent for user ${user.id}:`, {
                error: agentError instanceof Error ? agentError.message : 'Unknown error',
              });
            }
          }
        } catch (createError) {
          logger.error(`[AUTH] Failed to create default starship for newly approved user ${user.id}:`, {
            error: createError instanceof Error ? createError.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      console.error(`[AUTH] Failed to fetch starships for user ${user.id}:`, error);
      // Continue with login even if starship fetch fails
    }

    // Generate JWT token
    const token = await generateJWT({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    });

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0],
        avatar: user.avatar,
      },
      token,
      starship: firstStarship
        ? {
            id: firstStarship.id,
            slug: firstStarship.slug,
            name: firstStarship.name,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[AUTH] Login error:', error);
    handleError(error, res, 'user login');
  }
});

/**
 * Get current user
 * GET /auth/me
 */
router.get('/auth/me', async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'Missing or invalid Authorization header', 401);
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT token
    const { payload } = await verifyJWT(token);

    // Get user from database
    const user = await UserService.getUserById(payload.sub as string);
    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    sendSuccess(res, {
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
      avatar: user.avatar,
    });
  } catch (error: any) {
    console.error('[AUTH] Me endpoint error:', error);

    if (error?.name === 'JWTExpired') {
      sendError(res, 'TOKEN_EXPIRED', 'Token expired', 401);
      return;
    }
    if (error?.name === 'JWTInvalid') {
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid token', 401);
      return;
    }

    handleError(error, res, 'get current user');
  }
});

/**
 * Logout user (client-side token removal)
 * POST /auth/logout
 */
router.post('/auth/logout', (req: Request, res: Response): void => {
  // With JWT, logout is primarily handled client-side by removing the token
  // Server-side logout would require a token blacklist, which adds complexity
  sendSuccess(res, { message: 'Logged out successfully' });
});

// ============================================================================
// OAUTH ROUTES
// ============================================================================

/**
 * OAuth initiation routes with Zod validation
 * GET /auth/:provider
 */
router.get('/auth/:provider', async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(z.object({ provider: OAuthProviderSchema }), req.params, res, 'OAuth provider');
    if (!paramValidation) return;

    const { provider } = paramValidation;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/${provider}/callback`;
    const state = await generateOAuthState();

    let authUrl: string;
    if (provider === 'google') {
      const scope = 'openid email profile';
      authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;
    } else {
      const scope = 'user:email';
      authUrl =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${env.GITHUB_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;
    }

    res.redirect(authUrl);
  } catch (error: any) {
    handleError(error, res, 'OAuth initiation');
  }
});

/**
 * OAuth callback routes with proper validation
 * GET /auth/:provider/callback
 */
router.get('/auth/:provider/callback', async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(z.object({ provider: OAuthProviderSchema }), req.params, res, 'OAuth provider');
    if (!paramValidation) return;

    // Validate query parameters
    const queryValidation = validateData(OAuthCallbackSchema, req.query, res, 'OAuth callback');
    if (!queryValidation) return;

    const { provider } = paramValidation;
    const { code, state, error: oauthError } = queryValidation;

    // Handle OAuth provider errors
    if (oauthError) {
      return res.redirect(`${env.OAUTH_REDIRECT_BASE_URL}/login?oauth_error=provider_error`);
    }

    // Validate state parameter (CSRF protection)
    if (!(await validateOAuthState(state))) {
      return res.redirect(`${env.OAUTH_REDIRECT_BASE_URL}/login?oauth_error=invalid_state`);
    }

    // Delegate to service layer (Layer 4)
    const result = await UserService.createUserFromOAuth(provider, code);

    if (result.waitlisted) {
      return res.redirect(`${env.OAUTH_REDIRECT_BASE_URL}/login?oauth_waitlist=pending`);
    }

    // Generate JWT using shared utility
    const token = await generateJWT({
      id: result.user.id,
      email: result.user.email,
      name: result.user.displayName || result.user.email?.split('@')[0],
    });

    // Redirect to existing login page with token
    return res.redirect(`${env.OAUTH_REDIRECT_BASE_URL}/login?oauth_token=${token}`);
  } catch (error: any) {
    logger.error('[AUTH] OAuth callback error:', {
      provider: req.params.provider,
      error: error.message,
      stack: error.stack,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
    });

    return res.redirect(`${env.OAUTH_REDIRECT_BASE_URL}/login?oauth_error=callback_failed`);
  }
});

/**
 * Get user's linked OAuth accounts
 * GET /auth/oauth/accounts
 */
router.get('/auth/oauth/accounts', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;

    // Delegate to service layer (Layer 4)
    const userService = new UserService();
    const accounts = await userService.getUserOAuthAccounts(userId);

    sendSuccess(res, {
      accounts: accounts.map((account) => ({
        provider: account.provider,
        email: account.email,
        profileData: account.profileData,
        linkedAt: account.createdAt,
      })),
    });
  } catch (error: any) {
    handleError(error, res, 'get OAuth accounts');
  }
});

/**
 * Unlink OAuth account
 * DELETE /auth/oauth/unlink/:provider
 */
router.delete('/auth/oauth/unlink/:provider', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(z.object({ provider: OAuthProviderSchema }), req.params, res, 'OAuth provider');
    if (!paramValidation) return;

    const userId = (req as any).user!.id;
    const { provider } = paramValidation;

    // Delegate to service layer (Layer 4) - includes business rule validation
    const userService = new UserService();
    await userService.unlinkOAuthAccount(userId, provider);

    sendSuccess(res, { message: `${provider} account unlinked successfully` });
  } catch (error: any) {
    handleError(error, res, 'unlink OAuth account');
  }
});

export default router;
