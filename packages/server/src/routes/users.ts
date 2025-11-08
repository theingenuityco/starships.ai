/**
 * User management routes - Layer 5 (API Routes)
 *
 * Exposes user business functionality through REST API endpoints.
 * Follows the layered architecture pattern established by conversations.ts and agents.ts.
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { UserService } from '@/services/UserService';
import { StarshipService } from '@/services/StarshipService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { PasswordSchema, EmailSchema, DisplayNameSchema, AvatarSchema } from '@/schemas/common';
import type { CreateUserRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { rateLimiters } from '@/middleware/rateLimiter';

const router: Router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateUserSchema = z.object({
  email: EmailSchema.optional(),
  displayName: DisplayNameSchema.optional(),
  avatar: AvatarSchema.optional(),
});

const UpdateUserSchema = z.object({
  email: EmailSchema.optional(),
  displayName: DisplayNameSchema.optional(),
  avatar: AvatarSchema.optional(),
});

const UpdateUserProfileSchema = z.object({
  email: EmailSchema.optional(),
  displayName: DisplayNameSchema.optional(),
  avatar: AvatarSchema.optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: PasswordSchema.optional(),
});

const CreateUserWithPasswordSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema.optional(),
});

const InitiateEmailChangeSchema = z.object({
  newEmail: EmailSchema,
});

// Helper function to validate request data with Zod
function validateData<T>(schema: z.ZodSchema<T>, data: unknown, res: Response, fieldName: string): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      sendError(res, 'VALIDATION_ERROR', `Invalid ${fieldName}`, 400, { issues });
    } else {
      sendError(res, 'VALIDATION_ERROR', `Invalid ${fieldName}`, 400);
    }
    return null;
  }
}

// Helper function to check authentication
function checkAuth(req: Request, res: Response): boolean {
  if (!req.user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
}

// ============================================================================
// USER MANAGEMENT ENDPOINTS
// ============================================================================

// GET /users/:id - Get user by ID (OpenAPI pattern)
router.get('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only view their own profile
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only view your own profile', 403);
      return;
    }

    const userService = new UserService();
    const user = await userService.getUserById(req.params.id);

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'fetching user');
  }
});

// GET /users/email/:email - Get user by email (OpenAPI pattern)
router.get('/users/email/:email', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const { email } = req.params;

    if (!email || !email.includes('@')) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid email format', 400, {
        field: 'email',
        provided: email,
      });
      return;
    }

    // Anti-enumeration: Only allow lookup of the authenticated user's email; otherwise return 404
    if (email.toLowerCase() !== (req.user?.email || '').toLowerCase()) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        email,
      });
      return;
    }

    const userService = new UserService();
    const user = await userService.getUserByEmail(email);

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        email: email,
      });
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'fetching user by email');
  }
});

// GET /users - Self-only listing (returns only the authenticated user)
router.get('/users', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    // Restrict enumeration: return only the authenticated user's record
    const userService = new UserService();
    const self = await userService.getUserById(req.user!.id);

    const items = self ? [self] : [];
    const paginationMeta = createPaginationMeta(1, 1, items.length);

    sendSuccess(res, items, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'listing users');
  }
});

// POST /users - Create new user (OpenAPI pattern)
router.post('/users', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const createRequest = validateData(CreateUserSchema, req.body, res, 'user data');
    if (!createRequest) return;

    const userService = new UserService();
    const user = await userService.createUser(createRequest as CreateUserRequest);

    sendSuccess(res, user, 201);
  } catch (error) {
    handleError(error, res, 'creating user');
  }
});

// POST /users/register - Register user with password (OpenAPI pattern)
router.post('/users/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const registrationRequest = validateData(CreateUserWithPasswordSchema, req.body, res, 'registration data');
    if (!registrationRequest) return;

    const userService = new UserService();
    const user = await userService.createUserWithPassword(registrationRequest);

    sendSuccess(res, user, 201);
  } catch (error) {
    handleError(error, res, 'registering user');
  }
});

// PUT /users/:id - Update user (OpenAPI pattern)
router.put('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only update their own account
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only update your own account', 403);
      return;
    }

    const updates = validateData(UpdateUserSchema, req.body, res, 'user updates');
    if (!updates) return;

    const userService = new UserService();
    const user = await userService.updateUserProfile(req.params.id, updates);

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'updating user');
  }
});

// PUT /users/:id/profile - Update user profile (includes password change)
router.put('/users/:id/profile', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only update their own profile
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only update your own profile', 403);
      return;
    }

    const updates = validateData(UpdateUserProfileSchema, req.body, res, 'profile updates');
    if (!updates) return;

    // Validation: If changing password, current password is required
    if (updates.newPassword && !updates.currentPassword) {
      sendError(res, 'VALIDATION_ERROR', 'Current password is required when changing password', 400, {
        field: 'currentPassword',
        message: 'Current password must be provided to change password',
      });
      return;
    }

    const userService = new UserService();
    const user = await userService.updateUserProfile(req.params.id, updates);

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'updating user profile');
  }
});

// DELETE /users/:id - Delete user (OpenAPI pattern)
router.delete('/users/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only delete their own account (or admin in future)
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only delete your own account', 403);
      return;
    }

    const userService = new UserService();
    const deleted = await userService.deleteUser(req.params.id);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, { message: 'User deleted successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'deleting user');
  }
});

// ============================================================================
// USER STARSHIPS ENDPOINTS
// ============================================================================

// GET /users/:id/starships - Get user's starships (OpenAPI pattern)
router.get('/users/:id/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    const requestedUserId = req.params.id;
    const currentUserId = req.user?.id;

    // Authorization: Users can only access their own starships
    if (requestedUserId !== currentUserId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own starships', 403);
      return;
    }

    // Validate pagination query parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;

    const starshipService = new StarshipService();
    const starships = await starshipService.getStarshipsByOwner(requestedUserId);

    // Apply pagination
    const total = starships.length;
    const offset = (page - 1) * limit;
    const paginatedStarships = starships.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, total);

    sendSuccess(res, paginatedStarships, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching user starships');
  }
});

// (Removed) /users/stats endpoint: not used and could expose aggregated user data

// ============================================================================
// AUTHENTICATION ENDPOINTS (for internal use)
// ============================================================================

// POST /users/authenticate - Authenticate user (internal endpoint)
router.post('/users/authenticate', async (req: Request, res: Response): Promise<void> => {
  try {
    const authRequest = validateData(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }),
      req.body,
      res,
      'authentication data'
    );
    if (!authRequest) return;

    const userService = new UserService();
    const user = await userService.authenticateUser(authRequest.email, authRequest.password);

    if (!user) {
      sendError(res, 'AUTHENTICATION_FAILED', 'Invalid email or password', 401);
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'authenticating user');
  }
});

// ============================================================================
// EMAIL CHANGE ENDPOINTS
// ============================================================================

// POST /users/:id/email/change - Initiate email change
router.post('/users/:id/email/change', jwtAuthMiddleware, rateLimiters.sensitive, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only change their own email
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only change your own email', 403);
      return;
    }

    const bodyValidation = validateData(InitiateEmailChangeSchema, req.body, res, 'email change data');
    if (!bodyValidation) return;

    const { newEmail } = bodyValidation;

    const userService = new UserService();
    await userService.initiateEmailChange(req.params.id, newEmail);

    sendSuccess(res, { message: 'Email change verification email sent successfully.' });
  } catch (error) {
    handleError(error, res, 'initiating email change');
  }
});

// POST /users/:id/email/change/resend - Resend email change verification email
router.post('/users/:id/email/change/resend', jwtAuthMiddleware, rateLimiters.sensitive, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only resend their own email change
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only resend your own email change', 403);
      return;
    }

    const userService = new UserService();
    const pendingChange = await userService.getPendingEmailChange(req.params.id);

    if (!pendingChange) {
      sendError(res, 'VALIDATION_ERROR', 'No pending email change found', 400);
      return;
    }

    // Initiate email change - this atomically cancels old tokens and creates a new one
    // Fix: Don't call cancelEmailChange separately to avoid race condition where
    // cancel succeeds but initiate fails, leaving user without a pending change
    await userService.initiateEmailChange(req.params.id, pendingChange.newEmail);

    sendSuccess(res, { message: 'Email change verification email resent successfully.' });
  } catch (error) {
    handleError(error, res, 'resending email change verification email');
  }
});

// POST /users/:id/email/change/cancel - Cancel email change
router.post('/users/:id/email/change/cancel', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only cancel their own email change
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only cancel your own email change', 403);
      return;
    }

    const userService = new UserService();
    await userService.cancelEmailChange(req.params.id);

    sendSuccess(res, { message: 'Email change cancelled successfully.' });
  } catch (error) {
    handleError(error, res, 'cancelling email change');
  }
});

// GET /users/:id/email/change/status - Get email change status
router.get('/users/:id/email/change/status', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    // Authorization: Users can only check their own email change status
    if (req.params.id !== req.user?.id) {
      sendError(res, 'ACCESS_DENIED', 'You can only check your own email change status', 403);
      return;
    }

    const userService = new UserService();
    const pendingChange = await userService.getPendingEmailChange(req.params.id);

    if (!pendingChange) {
      sendSuccess(res, { pending: false });
      return;
    }

    sendSuccess(res, {
      pending: true,
      newEmail: pendingChange.newEmail,
      expiresAt: pendingChange.expiresAt,
    });
  } catch (error) {
    handleError(error, res, 'fetching email change status');
  }
});

export default router;
