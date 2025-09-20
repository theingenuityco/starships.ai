/**
 * User management routes - Layer 5 (API Routes)
 *
 * Exposes user business functionality through REST API endpoints.
 * Follows the layered architecture pattern established by conversations.ts and agents.ts.
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { UserService } from '@/services/UserService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { CreateUserRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

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
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(100).optional(),
  avatar: z.string().url().max(500).optional(),
  stripeCustomerId: z
    .string()
    .regex(/^cus_[a-zA-Z0-9]+$/, 'Invalid Stripe Customer ID format')
    .optional(),
});

const UpdateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(100).optional(),
  avatar: z.string().url().max(500).optional(),
  stripeCustomerId: z
    .string()
    .regex(/^cus_[a-zA-Z0-9]+$/, 'Invalid Stripe Customer ID format')
    .optional(),
});

const UpdateUserProfileSchema = z.object({
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(100).optional(),
  avatar: z.string().url().max(500).optional(),
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(6).optional(),
});

const CreateUserWithPasswordSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(255),
  displayName: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100).optional(), // Legacy support
});

const LinkStripeSchema = z.object({
  stripeCustomerId: z.string().regex(/^cus_[a-zA-Z0-9]+$/, 'Invalid Stripe Customer ID format'),
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

// GET /users - List users with pagination (admin/internal endpoint)
router.get('/users', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;

    const userService = new UserService();
    const allUsers = await userService.getAllUsers();

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(startIndex, startIndex + limit);

    const paginationMeta = createPaginationMeta(page, limit, allUsers.length);

    sendSuccess(res, paginatedUsers, 200, paginationMeta);
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
// STRIPE INTEGRATION ENDPOINTS
// ============================================================================

// POST /users/:id/stripe - Link user to Stripe customer (OpenAPI pattern)
router.post('/users/:id/stripe', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;

    const linkRequest = validateData(LinkStripeSchema, req.body, res, 'Stripe data');
    if (!linkRequest) return;

    const userService = new UserService();
    await userService.linkStripeCustomer(req.params.id, linkRequest.stripeCustomerId);

    sendSuccess(res, { message: 'Stripe customer linked successfully' });
  } catch (error) {
    handleError(error, res, 'linking Stripe customer');
  }
});

// GET /users/stripe/:stripeCustomerId - Get user by Stripe customer ID (OpenAPI pattern)
router.get('/users/stripe/:stripeCustomerId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const { stripeCustomerId } = req.params;

    if (!stripeCustomerId.startsWith('cus_')) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid Stripe Customer ID format', 400, {
        field: 'stripeCustomerId',
        expected: 'cus_xxxxxxxx',
        provided: stripeCustomerId,
      });
      return;
    }

    const userService = new UserService();
    const user = await userService.getUserByStripeCustomerId(stripeCustomerId);

    if (!user) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, {
        resource: 'user',
        stripeCustomerId: stripeCustomerId,
      });
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    handleError(error, res, 'fetching user by Stripe ID');
  }
});

// ============================================================================
// ANALYTICS AND STATISTICS ENDPOINTS
// ============================================================================

// GET /users/stats - Get user statistics (admin endpoint)
router.get('/users/stats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    // TODO: Add admin authorization check in the future
    // For now, any authenticated user can view stats

    const userService = new UserService();
    const stats = await userService.getUserStats();

    sendSuccess(res, stats);
  } catch (error) {
    handleError(error, res, 'fetching user statistics');
  }
});

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

export default router;
