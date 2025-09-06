/**
 * Authentication Routes
 *
 * JWT-based authentication system for user registration, login, and token management
 */

import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { getEnvConfig } from '@starships/env';
import { StarshipRepository } from '@starships/models';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z, ZodError } from 'zod';

const router: Router = Router();
const env = getEnvConfig();

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET || 'starships-jwt-secret-key-change-in-production');
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

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

    // Check if user exists
    const existingUser = await UserService.getUserByEmail(email);
    if (existingUser) {
      sendError(res, 'RESOURCE_CONFLICT', 'User already exists', 409);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await UserService.createUser({
      email,
      password: hashedPassword,
      name,
      displayName: name,
      username: email.split('@')[0],
    });

    // Create default starship for the new user
    let defaultStarship;
    let defaultAgent;
    try {
      defaultStarship = await StarshipService.createDefaultStarship(user.id);
      console.log(`[AUTH] Created default starship for user: ${user.id}`);

      // Create default agent from "General Assistant" template
      if (defaultStarship) {
        try {
          defaultAgent = await StarshipService.createDefaultAgent(user.id, defaultStarship.id);
          if (defaultAgent) {
            console.log(`[AUTH] Created default agent for user: ${user.id}`);
          } else {
            console.log(`[AUTH] No default agent created for user: ${user.id}`);
          }
        } catch (agentError) {
          console.error(`[AUTH] Failed to create default agent for user ${user.id}:`, agentError);
          // Continue even if agent creation fails
        }
      }
    } catch (error) {
      console.error(`[AUTH] Failed to create default starship for user ${user.id}:`, error);
      // Continue with registration even if starship creation fails
    }

    // Generate JWT token
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.displayName || user.username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

    console.log(`[AUTH] User registered: ${user.id} (${user.email})`);

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || user.username,
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
    console.error('[AUTH] Registration error:', error);
    if (!handleCommonError(error, res, 'user registration')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Registration failed', 500);
    }
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
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
      return;
    }

    // Get user's starships for redirect purpose
    let firstStarship = null;
    try {
      const starshipRepo = new StarshipRepository();
      const userStarships = await starshipRepo.findByOwner(user.id);
      // Find the first active starship
      firstStarship = userStarships.find((ship: any) => ship.status === 'active') || userStarships[0] || null;
      if (firstStarship) {
        console.log(`[AUTH] Found first starship for redirect: ${firstStarship.name} (${firstStarship.slug})`);
      }
    } catch (error) {
      console.error(`[AUTH] Failed to fetch starships for user ${user.id}:`, error);
      // Continue with login even if starship fetch fails
    }

    // Generate JWT token
    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.displayName || user.username,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

    console.log(`[AUTH] User logged in: ${user.id} (${user.email})`);

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName || user.username,
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
    if (!handleCommonError(error, res, 'user login')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Login failed', 500);
    }
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
      name: user.displayName || user.username,
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

    if (!handleCommonError(error, res, 'get current user')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Authentication failed', 500);
    }
  }
});

/**
 * Logout user (client-side token removal)
 * POST /auth/logout
 */
router.post('/auth/logout', (req: Request, res: Response): void => {
  // With JWT, logout is primarily handled client-side by removing the token
  // Server-side logout would require a token blacklist, which adds complexity
  console.log('[AUTH] User logged out');
  sendSuccess(res, { message: 'Logged out successfully' });
});

export default router;
