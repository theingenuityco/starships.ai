/**
 * Authentication Routes
 *
 * JWT-based authentication system for user registration, login, and token management
 */

import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { WaitlistService } from '@/services/WaitlistService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { getEnvConfig } from '@starships/env';
import { getConnection, StarshipRepository, WaitlistRepository } from '@starships/models';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z, ZodError } from 'zod';
import { logger } from '@/utils/logger';

const router: Router = Router();
const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

// Initialize waitlist service
const initWaitlistService = () => {
  const connection = getConnection();
  const waitlistRepo = new WaitlistRepository(connection);
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
      return sendSuccess(res, {
        waitlisted: true,
        status: 'pending',
        message: 'Thanks for signing up! Please wait for approval to access the app.',
      }, 200);
    }
    
    // Only create starship and provide token for approved users
    let defaultStarship;
    let defaultAgent;
    
    if (finalStatus.status === 'approved') {
      try {
        defaultStarship = await StarshipService.createDefaultStarship(user.id);

        // Create default agent from "General Assistant" template
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
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

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
        return sendSuccess(res, {
          waitlisted: true,
          status: 'pending',
          message: 'Please wait for approval to access the app.',
        }, 200);
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
      return sendSuccess(res, {
        waitlisted: true,
        status: 'pending',
        message: 'Please wait for approval to access the app.',
      }, 200);
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
          
          // Also create default agent
          if (firstStarship) {
            try {
              defaultAgent = await StarshipService.createDefaultAgent(user.id, firstStarship.id);
              logger.info(`[AUTH] Created default agent for user ${user.email}`);
            } catch (agentError) {
              logger.error(`[AUTH] Failed to create default agent for user ${user.id}:`, {
                error: agentError instanceof Error ? agentError.message : 'Unknown error'
              });
            }
          }
        } catch (createError) {
          logger.error(`[AUTH] Failed to create default starship for newly approved user ${user.id}:`, {
            error: createError instanceof Error ? createError.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      console.error(`[AUTH] Failed to fetch starships for user ${user.id}:`, error);
      // Continue with login even if starship fetch fails
    }

    // Generate JWT token
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

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
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

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

export default router;
