/**
 * Authentication Routes
 *
 * JWT-based authentication system for user registration, login, and token management
 */

import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { ServiceFactory } from '@/services/ServiceFactory';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { generateJWT, generateOAuthState, validateOAuthState, verifyJWT, generateAuthCode, validateAndConsumeAuthCode } from '@/utils/jwt';
import { getEnvConfig } from '@starships/env';
import { StarshipRepository } from '@starships/models';
import type { AuthLoginResponse } from '@starships/protocol';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { logger } from '@/utils/logger';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';

const router: Router = Router();
const env = getEnvConfig();


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

// Zod schema for setting password
const SetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password must be less than 255 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Zod schema for email verification
const EmailVerificationSchema = z.object({
  email: z.string().email('Invalid email format'),
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

    // Use RegistrationOrchestrator for clean business logic separation
    const registrationOrchestrator = ServiceFactory.createRegistrationOrchestrator();
    const result = await registrationOrchestrator.registerUser({ email, password, name });

    sendSuccess(res, result, 201);
  } catch (error: any) {
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
      return sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
      return;
    }

    // Add email verification check before proceeding
    if (!user.emailVerified) {
      const response: AuthLoginResponse = {
        emailNotVerified: true,
        message: 'Please verify your email address before signing in.',
        canResendVerification: true,
      };

      return sendSuccess(res, response, 200);
    }

    // Get user's starships for redirect purpose
    let firstStarship = null;
    try {
      const starshipRepo = new StarshipRepository();
      const userStarships = await starshipRepo.findByOwner(user.id);
      // Find the first active starship
      firstStarship = userStarships.find((ship: any) => ship.status === 'active') || userStarships[0] || null;

      // If user has no starship, create one now
      if (!firstStarship) {
        logger.info(`[AUTH] Creating starship for user ${user.email}`);
        try {
          firstStarship = await StarshipService.createDefaultStarship(user.id);

          // Also create default Daedalus agent and host tools
          if (firstStarship) {
            try {
              await StarshipService.createDefaultAgent(user.id, firstStarship.id);
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
      hasPassword: user.hasPassword || false,
      authMethods: user.authMethods || [],
      primaryAuthMethod: user.primaryAuthMethod || 'password'
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
// EMAIL VERIFICATION ROUTES
// ============================================================================

/**
 * Verify email address using verification token
 * GET /auth/verify-email?token=xxx
 * Follows established route patterns with Zod validation
 */
router.get('/auth/verify-email', async (req: Request, res: Response) => {
  try {
    // Validate query parameters using Zod
    const queryValidation = validateData(z.object({ token: z.string().min(1, 'Token is required') }), req.query, res, 'verification token');
    if (!queryValidation) return;

    const { token } = queryValidation;
    const env = getEnvConfig();

    // Use RegistrationOrchestrator for clean business logic separation
    const registrationOrchestrator = ServiceFactory.createRegistrationOrchestrator();
    const result = await registrationOrchestrator.completeEmailVerification(token);

    // Redirect based on orchestrator result
    const redirectUrl = `${env.PUBLIC_URL}${result.redirectPath}`;
    return res.redirect(redirectUrl);
  } catch (error: any) {
    logger.error('[EMAIL-VERIFY] Error:', { error });
    const env = getEnvConfig();
    return res.redirect(`${env.PUBLIC_URL}/login?verification=error`);
  }
});

/**
 * Resend verification email using established patterns
 * POST /auth/resend-verification
 * Follows established route patterns with Zod validation
 */
router.post('/auth/resend-verification', async (req: Request, res: Response) => {
  try {
    // Validate request body using Zod
    const bodyValidation = validateData(EmailVerificationSchema, req.body, res, 'resend verification data');
    if (!bodyValidation) return;

    const { email } = bodyValidation;

    // Delegate to service layer for business logic
    const userService = ServiceFactory.createUserService();
    const user = await UserService.getUserByEmail(email);

    if (!user || user.emailVerified) {
      // Don't reveal if user exists (security best practice)
      return sendSuccess(res, {
        message: 'If an unverified account exists, a verification email has been sent.',
      });
    }

    // Send verification email via service layer
    await userService.sendEmailVerification(user.id, email);

    sendSuccess(res, {
      message: 'Verification email sent successfully.',
    });
  } catch (error: any) {
    handleError(error, res, 'resend verification email');
  }
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
    // Use PUBLIC_URL for OAuth callback to work in all environments (local, dev, prod)
    const redirectUri = `${env.PUBLIC_URL}/api/v1/auth/${provider}/callback`;
    
    // Check if this is a linking request (user already logged in)
    const isLinking = req.query.link === 'true';
    
    // SECURITY: Block direct linking attempts without proper authentication
    if (isLinking) {
      // Return error for unauthenticated linking attempts
      return res.redirect(`${env.PUBLIC_URL}/profile?oauth_link=error&message=unauthorized_linking`);
    }
    
    const state = await generateOAuthState(isLinking);

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
        `client_id=${env.GH_OAUTH_CLIENT_ID}&` +
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
      return res.redirect(`${env.PUBLIC_URL}/login?oauth_error=provider_error`);
    }

    // Validate state parameter (CSRF protection)
    const stateValidation = await validateOAuthState(state);
    if (!stateValidation.valid) {
      return res.redirect(`${env.PUBLIC_URL}/login?oauth_error=invalid_state`);
    }

    const { isLinking, userId } = stateValidation;

    // If this is account linking, handle differently
    if (isLinking) {
      // SECURITY: Verify userId is present in linking state
      if (!userId) {
        return res.redirect(`${env.PUBLIC_URL}/profile?oauth_link=error&message=invalid_state`);
      }
      
      // Implement actual account linking logic
      try {
        // Get OAuth profile from provider using the authorization code
        const userService = ServiceFactory.createUserService();
        const profile = await userService.getOAuthProfile(provider, code);
        
        // Link the OAuth account to the existing authenticated user
        await userService.linkOAuthAccount(userId, profile);
        
        logger.info('[OAUTH-LINKING] Successfully linked account', { 
          userId, 
          provider
        });
        
        return res.redirect(`${env.PUBLIC_URL}/profile?oauth_link=success&provider=${provider}`);
      } catch (error: any) {
        logger.error('[OAUTH-LINKING] Failed to link account', { 
          userId, 
          provider,
          errorType: error.constructor.name
        });
        
        return res.redirect(`${env.PUBLIC_URL}/profile?oauth_link=error&message=linking_failed`);
      }
    }

    // Regular OAuth flow for new user registration
    // Delegate to service layer (Layer 4)
    const result = await UserService.createUserFromOAuth(provider, code);

    // ✅ SECURITY FIX: Generate secure authorization code instead of JWT token
    const authCode = await generateAuthCode(result.user.id, result.user.email!);

    // Redirect with secure authorization code (short-lived, single-use)
    return res.redirect(`${env.PUBLIC_URL}/login?auth_code=${authCode}`);
  } catch (error: any) {
    logger.error('[AUTH] OAuth callback error:', {
      provider: req.params.provider,
      error: error.message,
      stack: error.stack,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
    });

    return res.redirect(`${env.PUBLIC_URL}/login?oauth_error=callback_failed`);
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
    const userService = ServiceFactory.createUserService();
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
    const userService = ServiceFactory.createUserService();
    await userService.unlinkOAuthAccount(userId, provider);

    sendSuccess(res, { message: `${provider} account unlinked successfully` });
  } catch (error: any) {
    handleError(error, res, 'unlink OAuth account');
  }
});

/**
 * Set password for OAuth-only users
 * POST /auth/set-password
 */
router.post('/auth/set-password', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = validateData(SetPasswordSchema, req.body, res, 'set password');
    if (!validation) return;

    const userId = (req as any).user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.setPasswordForOAuthUser(userId, validation);

    sendSuccess(res, { user, message: 'Password set successfully' });
  } catch (error: any) {
    handleError(res, error, 'Setting password failed');
  }
});

/**
 * Get user authentication methods
 * GET /auth/methods
 */
router.get('/auth/methods', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.getUserById(userId);

    if (!user) return sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);

    sendSuccess(res, {
      hasPassword: user.hasPassword || false,
      authMethods: user.authMethods || [],
      primaryAuthMethod: user.primaryAuthMethod || 'password'
    });
  } catch (error: any) {
    handleError(res, error, 'Getting auth methods failed');
  }
});

/**
 * Exchange OAuth authorization code for JWT token (SECURE)
 * POST /auth/oauth/exchange
 */
router.post('/auth/oauth/exchange', async (req: Request, res: Response) => {
  try {
    const { authCode } = req.body;
    
    if (!authCode) {
      return sendError(res, 'VALIDATION_ERROR', 'Authorization code is required', 400);
    }
    
    // Validate and consume the authorization code (one-time use)
    logger.info('[OAUTH-EXCHANGE] Attempting to validate auth code');
    const codeData = await validateAndConsumeAuthCode(authCode);
    
    if (!codeData) {
      logger.error('[OAUTH-EXCHANGE] Auth code validation failed - likely already consumed or expired');
      return sendError(res, 'AUTHENTICATION_FAILED', 'Invalid or expired authorization code. Please try logging in again.', 400);
    }
    
    logger.info('[OAUTH-EXCHANGE] Auth code validated successfully', { userId: codeData.userId });
    
    // Get full user data
    const user = await UserService.getUserById(codeData.userId);
    if (!user) {
      return sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
    }
    
    // Generate JWT token (returned in response body, NOT URL)
    const token = await generateJWT({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    });
    
    // Get user's first starship for redirect
    let firstStarship = null;
    try {
      const starshipRepo = new StarshipRepository();
      const userStarships = await starshipRepo.findByOwner(user.id);
      firstStarship = userStarships.find((ship: any) => ship.status === 'active') || userStarships[0] || null;
    } catch (error) {
      console.error(`[OAUTH-EXCHANGE] Failed to fetch starships for user ${user.id}:`, error);
    }
    
    // Return secure response with JWT in body
    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0],
        avatar: user.avatar,
        hasPassword: user.hasPassword || false,
        authMethods: user.authMethods || [],
        primaryAuthMethod: user.primaryAuthMethod || 'oauth'
      },
      token,
      starship: firstStarship ? {
        id: firstStarship.id,
        slug: firstStarship.slug,
        name: firstStarship.name,
      } : null,
    });
  } catch (error: any) {
    logger.error('[OAUTH-EXCHANGE] Token exchange failed:', {
      error: error.message,
      stack: error.stack,
    });
    
    return sendError(res, 'INTERNAL_SERVER_ERROR', 'Token exchange failed', 500);
  }
});

/**
 * Initialize auth methods for existing users (migration helper)
 * POST /auth/init-methods
 */
router.post('/auth/init-methods', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.initializeUserAuthMethods(userId);

    sendSuccess(res, { 
      user,
      message: 'Authentication methods initialized successfully'
    });
  } catch (error: any) {
    handleError(res, error, 'Initializing auth methods failed');
  }
});

/**
 * Secure OAuth account linking initiation (authenticated endpoint)
 * POST /auth/oauth/link/:provider
 */
router.post('/auth/oauth/link/:provider', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(z.object({ provider: OAuthProviderSchema }), req.params, res, 'OAuth provider');
    if (!paramValidation) return;

    const { provider } = paramValidation;
    const userId = (req as any).user!.id;
    // Use PUBLIC_URL for OAuth callback to work in all environments (local, dev, prod)
    const redirectUri = `${env.PUBLIC_URL}/api/v1/auth/${provider}/callback`;
    
    // Generate secure state with authenticated user ID
    const state = await generateOAuthState(true, userId);

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
        `client_id=${env.GH_OAUTH_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;
    }

    // Return the OAuth URL instead of redirecting
    sendSuccess(res, { authUrl });
  } catch (error: any) {
    handleError(error, res, 'OAuth linking initiation');
  }
});

export default router;
