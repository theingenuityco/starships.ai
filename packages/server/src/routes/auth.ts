/**
 * Authentication Routes
 *
 * JWT-based authentication system for user registration, login, and token management
 */

import { UserService } from '@/services/UserService';
import { ServiceFactory } from '@/services/ServiceFactory';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { generateJWT, generateOAuthState, validateOAuthState, verifyJWT, generateAuthCode, validateAndConsumeAuthCode } from '@/utils/jwt';
import { EmailSchema, PasswordSchema, OAuthProviderSchema, DisplayNameSchema, IdSchema } from '@/schemas/common';
import { getEnvConfig } from '@starships/env';
import { StarshipRepository, UserRepository } from '@starships/models';
import type { AuthLoginResponse, AuthPasswordResetResponse, AuthPasswordResetConfirmResponse } from '@starships/protocol';
import type { UserModel } from '@starships/protocol';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { rateLimiters } from '@/middleware/rateLimiter';
import { AgentService } from '@/services/AgentService';
import { StarshipService } from '@/services/StarshipService';
import { verifyResourceAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();
const env = getEnvConfig();

function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  // Prevent backslash-based protocol-relative tricks like "/\\evil.com"
  if (url.includes('\\')) return false;
  if (/^(javascript|data):/i.test(url)) return false;
  if (url.includes('@')) return false;
  return true;
}

// Zod schemas for validation
const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema.optional(),
});

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required').max(255, 'Password must be less than 255 characters'),
});

// OAuth-specific schemas that remain local to auth routes
const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
});

// Zod schema for setting password
const SetPasswordSchema = z
  .object({
    newPassword: PasswordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Zod schema for email verification
const EmailVerificationSchema = z.object({
  email: EmailSchema,
});

// Zod schemas for password reset
const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

const ResetPasswordSchema = z
  .object({
    token: z
      .string()
      .length(64, 'Invalid token format')
      .regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
    newPassword: PasswordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Zod schema for issuing agent-scoped tokens
const AgentTokenSchema = z.object({
  agentId: IdSchema,
  starshipId: IdSchema,
});

/**
 * Register new user
 * POST /auth/register
 */
router.post('/auth/register', rateLimiters.auth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(RegisterSchema, req.body, res, 'registration data');
    if (!bodyValidation) return;

    const { email, password, displayName } = bodyValidation;

    // Use RegistrationOrchestrator for clean business logic separation
    const registrationOrchestrator = ServiceFactory.createRegistrationOrchestrator();
    const result = await registrationOrchestrator.registerUser({ email, password, displayName });

    sendSuccess(res, result, 201);
  } catch (error) {
    handleError(error, res, 'user registration');
  }
});

/**
 * Login user
 * POST /auth/login
 */
router.post('/auth/login', rateLimiters.auth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(LoginSchema, req.body, res, 'login data');
    if (!bodyValidation) return;

    const { email, password } = bodyValidation;

    // Get user with password - enterprise standard approach
    const user = await UserService.getUserByEmailWithPassword(email);
    if (!user || !user.password) {
      return sendError(res, 'AUTHENTICATION_FAILED', 'Invalid email or password.', 401);
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

    // Get user's starships for redirect (owned + member).
    // Default starships are created at signup (password + OAuth), not on login.
    let firstStarship: { id: string; slug: string; name: string } | null = null;
    try {
      const starshipService = new StarshipService();
      const accessible = await starshipService.getStarshipsForUser(user.id);
      // If the user hasn't completed onboarding yet and they belong to a non-owned starship
      // (e.g. came in via invite), prefer landing them there to avoid forcing onboarding for
      // their default-owned starship. Onboarding is triggered when they later visit their OWN ship.
      const preferMemberFirst = !(user.wizardOnboardingCompleted ?? false);
      const memberShip =
        preferMemberFirst ? accessible.find((s) => s.status === 'active' && s.ownerId !== user.id) || accessible.find((s) => s.ownerId !== user.id) : null;
      const ship = memberShip || accessible.find((s) => s.status === 'active') || accessible[0] || null;
      if (ship) firstStarship = { id: ship.id, slug: ship.slug, name: ship.name };
    } catch (error) {
      logger.error('[AUTH] Failed to fetch starships for user', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Track first login (before updating lastLoginAt)
    const isFirstLogin = !user.lastLoginAt;

    // Update lastLoginAt for login tracking (general purpose)
    try {
      const userRepo = new UserRepository();
      await userRepo.update(user.id, {
        lastLoginAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('[AUTH] Failed to update lastLoginAt', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
        hasPassword: user.hasPassword || false,
        authMethods: user.authMethods || [],
        primaryAuthMethod: user.primaryAuthMethod || 'password',
        isInstanceAdmin: user.isInstanceAdmin || false,
        wizardOnboardingCompleted: user.wizardOnboardingCompleted ?? false,
      },
      token,
      isFirstLogin,
      starship: firstStarship,
    });
  } catch (error) {
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
      primaryAuthMethod: user.primaryAuthMethod || 'password',
      isInstanceAdmin: user.isInstanceAdmin || false,
      wizardOnboardingCompleted: user.wizardOnboardingCompleted ?? false,
    });
  } catch (error) {
    // Token expiration/invalidity is expected when a client holds a stale token.
    // Avoid logging these as server errors; the 401 response is the signal.
    if (error instanceof Error && (error.name === 'JWTExpired' || error.name === 'JWTInvalid')) {
      logger.debug('[AUTH] Me endpoint auth failed', {
        error: error.message,
        name: error.name,
        operation: 'token_validation',
      });
    } else {
      logger.error('[AUTH] Me endpoint error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    if (error instanceof Error && error.name === 'JWTExpired') {
      sendError(res, 'TOKEN_EXPIRED', 'Token expired', 401);
      return;
    }
    if (error instanceof Error && error.name === 'JWTInvalid') {
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

/**
 * Issue a user+agent-scoped JWT for acting via a specific agent on a starship.
 * POST /auth/token/agent
 */
router.post('/auth/token/agent', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(AgentTokenSchema, req.body, res, 'agent token request');
    if (!body) return;

    const { agentId, starshipId } = body;
    const userId = req.user!.id;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);

    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    if (agent.starshipId !== starshipId) {
      sendError(res, 'ACCESS_DENIED', 'Agent does not belong to the specified starship', 403);
      return;
    }

    // Ensure the user has access to this agent/starship
    const hasAccess = await verifyResourceAccess(agent.starshipId, userId, 'agent', agentId, res);
    if (!hasAccess) return;

    const user = req.user as UserModel;
    const token = await generateJWT({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
      agentId: agent.id,
      starshipId: agent.starshipId,
    });

    sendSuccess(res, { token }, 200);
  } catch (error) {
    handleError(error, res, 'issuing agent-scoped token');
  }
});

// ============================================================================
// EMAIL VERIFICATION ROUTES
// ============================================================================

/**
 * Helper function to get authenticated user from request (optional auth)
 * Returns user if authenticated, null if not (doesn't throw errors)
 * Follows optionalJwtAuth middleware pattern but as a helper function
 */
async function getAuthenticatedUserFromRequest(req: Request): Promise<UserModel | null> {
  try {
    // Try Authorization header (frontend sends JWT via Authorization header)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      if (token && token.length >= 10) {
        const { payload } = await verifyJWT(token);
        const user = await UserService.getUserById(payload.sub as string);
        if (user) return user;
      }
    }

    // Email links clicked directly won't have Authorization header (browser redirects)
    // This is expected - return null for unauthenticated users
    return null;
  } catch (error) {
    // Token expiration/invalidity is expected when a client holds a stale token.
    // Avoid logging these as server errors; the 401 response is the signal.
    if (error instanceof Error && (error.name === 'JWTExpired' || error.name === 'JWTInvalid')) {
      logger.debug('[AUTH] Me endpoint auth failed', {
        error: error.message,
        name: error.name,
        operation: 'token_validation',
      });
    } else {
      logger.error('[AUTH] Me endpoint error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return null;
  }
}

/**
 * Verify email address using verification token
 * GET /auth/verify-email?token=xxx
 * Follows established route patterns with Zod validation
 */
router.get('/auth/verify-email', async (req: Request, res: Response) => {
  try {
    // Validate query parameters using Zod
    const queryValidation = validateData(
      z.object({
        token: z
          .string()
          .length(64, 'Invalid token format')
          .regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
      }),
      req.query,
      res,
      'verification token'
    );
    if (!queryValidation) return;

    const { token } = queryValidation;
    const env = getEnvConfig();

    // Use RegistrationOrchestrator for clean business logic separation
    const registrationOrchestrator = ServiceFactory.createRegistrationOrchestrator();
    await registrationOrchestrator.completeEmailVerification(token);

    // Redirect to login page with success parameter for toast notification
    const redirectUrl = `${env.PUBLIC_URL}/login?verification=success`;
    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error('[EMAIL-VERIFY] Error:', { error });
    const env = getEnvConfig();
    return res.redirect(`${env.PUBLIC_URL}/login?verification=error`);
  }
});

/**
 * Resend verification email using established patterns
 * POST /auth/resend-verification
 * Rate limited to prevent email bombing attacks
 */
router.post('/auth/resend-verification', rateLimiters.sensitive, async (req: Request, res: Response) => {
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
  } catch (error) {
    handleError(error, res, 'resend verification email');
  }
});

/**
 * Verify email change using verification token
 * GET /auth/email/change/verify?token=xxx
 * Follows established route patterns with Zod validation
 */
router.get('/auth/email/change/verify', async (req: Request, res: Response) => {
  try {
    // Validate query parameters using Zod
    const queryValidation = validateData(
      z.object({
        token: z
          .string()
          .length(64, 'Invalid token format')
          .regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
      }),
      req.query,
      res,
      'email change verification token'
    );
    if (!queryValidation) return;

    const { token } = queryValidation;
    const env = getEnvConfig();

    // Use UserService for business logic
    const userService = ServiceFactory.createUserService();
    const result = await userService.completeEmailChange(token);

    // Check if user is authenticated using helper function
    const authenticatedUser = await getAuthenticatedUserFromRequest(req);
    const profilePath = await userService.getProfileRedirectPath(result.userId);

    // Determine redirect based on authentication status
    let redirectPath: string;
    if (authenticatedUser && authenticatedUser.id === result.userId) {
      // User is authenticated AND userId matches - redirect to profile page
      redirectPath = `${env.PUBLIC_URL}${profilePath}?emailChange=success`;
    } else {
      // User is not authenticated OR userId mismatch - redirect to login page with guidance
      const params = new URLSearchParams({
        returnUrl: `${profilePath}?emailChange=success`,
        emailChange: 'success',
        logout: 'true',
      });
      if (result.newEmail) {
        params.set('expectedEmail', result.newEmail);
      }
      redirectPath = `${env.PUBLIC_URL}/login?${params.toString()}`;
    }

    return res.redirect(redirectPath);
  } catch (error) {
    logger.error('[EMAIL-CHANGE-VERIFY] Error:', { error });
    const env = getEnvConfig();
    const params = new URLSearchParams({
      emailChange: 'error',
      logout: 'true',
    });
    return res.redirect(`${env.PUBLIC_URL}/login?${params.toString()}`);
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

    // Optional: carry a safe returnUrl through OAuth via state context.
    const returnUrlRaw = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : undefined;
    const returnUrl = returnUrlRaw && isValidRedirectUrl(returnUrlRaw) ? returnUrlRaw : undefined;
    const state = await generateOAuthState(isLinking, undefined, returnUrl ? { returnUrl } : undefined);

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
  } catch (error) {
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

    const { isLinking, userId, context } = stateValidation;
    const ctx = context as Record<string, unknown> | null | undefined;
    const returnUrlFromState = ctx && typeof ctx.returnUrl === 'string' ? (ctx.returnUrl as string) : undefined;
    const safeReturnUrl = returnUrlFromState && isValidRedirectUrl(returnUrlFromState) ? returnUrlFromState : undefined;

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
          provider,
        });

        // Get user's first starship to redirect back to the proper context
        let redirectPath = '/profile';
        try {
          const starshipRepo = new StarshipRepository();
          const userStarships = await starshipRepo.findByOwner(userId);
          const firstStarship = userStarships.find((ship) => ship.status === 'active') || userStarships[0];

          if (firstStarship) {
            redirectPath = `/ship/${firstStarship.slug}/settings/profile`;
          }
        } catch (error) {
          logger.warn('[OAUTH-LINKING] Failed to get starship for redirect, using default profile page', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        return res.redirect(`${env.PUBLIC_URL}${redirectPath}?oauth_link=success&provider=${provider}`);
      } catch (error) {
        logger.error('[OAUTH-LINKING] Failed to link account', {
          userId,
          provider,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        // Extract user-friendly error message
        let errorMessage = 'linking_failed';
        if (error instanceof Error) {
          // Check if it's a ValidationError with a specific message
          if (error.message.includes('already registered') || error.message.includes('already linked')) {
            errorMessage = encodeURIComponent(error.message);
          } else if (error.message) {
            errorMessage = encodeURIComponent(error.message);
          }
        }

        // Get user's first starship for error redirect too
        let errorRedirectPath = '/profile';
        try {
          const starshipRepo = new StarshipRepository();
          const userStarships = await starshipRepo.findByOwner(userId);
          const firstStarship = userStarships.find((ship) => ship.status === 'active') || userStarships[0];

          if (firstStarship) {
            errorRedirectPath = `/ship/${firstStarship.slug}/settings/profile`;
          }
        } catch (starshipError) {
          logger.warn('[OAUTH-LINKING] Failed to get starship for error redirect, using default profile page', {
            error: starshipError instanceof Error ? starshipError.message : 'Unknown error',
          });
        }

        return res.redirect(`${env.PUBLIC_URL}${errorRedirectPath}?oauth_link=error&message=${errorMessage}`);
      }
    }

    // Regular OAuth flow for new user registration
    // Delegate to service layer (Layer 4)
    const result = await UserService.createUserFromOAuth(provider, code);

    // ✅ SECURITY FIX: Generate secure authorization code instead of JWT token
    const authCode = await generateAuthCode(result.user.id, result.user.email!);

    // Redirect with secure authorization code (short-lived, single-use)
    if (safeReturnUrl) {
      return res.redirect(`${env.PUBLIC_URL}/login?auth_code=${authCode}&returnUrl=${encodeURIComponent(safeReturnUrl)}`);
    }
    return res.redirect(`${env.PUBLIC_URL}/login?auth_code=${authCode}`);
  } catch (error) {
    logger.error('[AUTH] OAuth callback error:', {
      provider: req.params.provider,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
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
    const userId = req.user!.id;

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
  } catch (error) {
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

    const userId = req.user!.id;
    const { provider } = paramValidation;

    // Delegate to service layer (Layer 4) - includes business rule validation
    const userService = ServiceFactory.createUserService();
    await userService.unlinkOAuthAccount(userId, provider);

    sendSuccess(res, { message: `${provider} account unlinked successfully` });
  } catch (error) {
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

    const userId = req.user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.setPasswordForOAuthUser(userId, validation);

    sendSuccess(res, { user, message: 'Password set successfully' });
  } catch (error) {
    handleError(error, res, 'Setting password failed');
  }
});

/**
 * Get user authentication methods
 * GET /auth/methods
 */
router.get('/auth/methods', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.getUserById(userId);

    if (!user) return sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);

    sendSuccess(res, {
      hasPassword: user.hasPassword || false,
      authMethods: user.authMethods || [],
      primaryAuthMethod: user.primaryAuthMethod || 'password',
    });
  } catch (error) {
    handleError(error, res, 'Getting auth methods failed');
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

    // Track first login (before updating lastLoginAt)
    const isFirstLogin = !user.lastLoginAt;

    // Update lastLoginAt for login tracking (general purpose)
    try {
      const userRepo = new UserRepository();
      await userRepo.update(user.id, {
        lastLoginAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('[OAUTH-EXCHANGE] Failed to update lastLoginAt', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue with login even if update fails
    }

    // Generate JWT token (returned in response body, NOT URL)
    const token = await generateJWT({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    });

    // Get user's starships for redirect (owned + member).
    // Default starships are created at signup (password + OAuth), not on login.
    let firstStarship: { id: string; slug: string; name: string } | null = null;
    try {
      const starshipService = new StarshipService();
      const accessible = await starshipService.getStarshipsForUser(user.id);
      // Same landing preference as password login: if wizard isn't complete and the user
      // has a non-owned starship, prefer that to avoid forcing onboarding immediately.
      const preferMemberFirst = !(user.wizardOnboardingCompleted ?? false);
      const memberShip =
        preferMemberFirst ? accessible.find((s) => s.status === 'active' && s.ownerId !== user.id) || accessible.find((s) => s.ownerId !== user.id) : null;
      const ship = memberShip || accessible.find((s) => s.status === 'active') || accessible[0] || null;
      if (ship) firstStarship = { id: ship.id, slug: ship.slug, name: ship.name };
    } catch (error) {
      logger.error('[OAUTH-EXCHANGE] Failed to fetch starships for user', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0],
        avatar: user.avatar,
        hasPassword: user.hasPassword || false,
        authMethods: user.authMethods || [],
        primaryAuthMethod: user.primaryAuthMethod || 'oauth',
        isInstanceAdmin: user.isInstanceAdmin || false,
        wizardOnboardingCompleted: user.wizardOnboardingCompleted ?? false,
      },
      token,
      isFirstLogin,
      starship: firstStarship,
    });
  } catch (error) {
    logger.error('[OAUTH-EXCHANGE] Token exchange failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
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
    const userId = req.user!.id;
    if (!userId) return sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);

    // Delegate to service layer
    const userService = ServiceFactory.createUserService();
    const user = await userService.initializeUserAuthMethods(userId);

    sendSuccess(res, {
      user,
      message: 'Authentication methods initialized successfully',
    });
  } catch (error) {
    handleError(error, res, 'Initializing auth methods failed');
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
    const userId = req.user!.id;
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
  } catch (error) {
    handleError(error, res, 'OAuth linking initiation');
  }
});

/**
 * Forgot password - Request password reset
 * POST /auth/forgot-password
 */
router.post('/auth/forgot-password', rateLimiters.sensitive, async (req: Request, res: Response) => {
  try {
    const bodyValidation = validateData(ForgotPasswordSchema, req.body, res, 'forgot password data');
    if (!bodyValidation) return;

    const { email } = bodyValidation;
    const userService = ServiceFactory.createUserService();
    await userService.sendPasswordReset(email);

    // SECURITY: Always return same message (prevent user enumeration)
    sendSuccess(res, {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
      emailSent: true,
    } as AuthPasswordResetResponse);
  } catch (error) {
    handleError(error, res, 'password reset request');
  }
});

/**
 * Reset password - Confirm password reset with token
 * POST /auth/reset-password
 */
router.post('/auth/reset-password', rateLimiters.sensitive, async (req: Request, res: Response) => {
  try {
    const bodyValidation = validateData(ResetPasswordSchema, req.body, res, 'reset password data');
    if (!bodyValidation) return;

    const { token, newPassword, confirmPassword } = bodyValidation;
    const userService = ServiceFactory.createUserService();
    await userService.resetPassword(token, newPassword, confirmPassword);

    sendSuccess(res, {
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
      redirectUrl: '/login?reset=success',
    } as AuthPasswordResetConfirmResponse);
  } catch (error) {
    handleError(error, res, 'password reset confirmation');
  }
});

export default router;
