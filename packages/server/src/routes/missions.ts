/**
 * Mission management routes - Layer 5 (API Routes)
 *
 * Exposes mission business functionality through REST API endpoints.
 * Follows the layered architecture pattern established by conversations.ts and users.ts.
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { MissionService } from '@/services/MissionService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { CreateMissionRequest, MissionFilters, MissionSort, UpdateMissionRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateMissionSchema = z.object({
  starshipId: NanoidSchema,
  name: z.string().min(1).max(200, 'Mission name cannot exceed 200 characters'),
  description: z.string().min(1).max(2000, 'Mission description cannot exceed 2000 characters'),
  agentIds: z.array(NanoidSchema).min(1, 'At least one agent must be assigned'),
});

const UpdateMissionSchema = z.object({
  name: z.string().min(1).max(200, 'Mission name cannot exceed 200 characters').optional(),
  description: z.string().min(1).max(2000, 'Mission description cannot exceed 2000 characters').optional(),
  status: z.enum(['draft', 'active', 'completed', 'failed', 'cancelled']).optional(),
  phase: z.enum(['welcome', 'analysis', 'plan', 'execute', 'converse']).optional(),
  agentIds: z.array(NanoidSchema).optional(),
  blueprintId: NanoidSchema.optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected', 'modified']).optional(),
});

const MissionFiltersSchema = z.object({
  status: z.array(z.enum(['draft', 'active', 'completed', 'failed', 'cancelled'])).optional(),
  createdBy: NanoidSchema.optional(),
  starshipId: NanoidSchema.optional(),
});

const MissionSortSchema = z.object({
  field: z.enum(['createdAt', 'updatedAt', 'status', 'name']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
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
// MISSION MANAGEMENT ENDPOINTS
// ============================================================================

// GET /missions/:id - Get mission by ID (OpenAPI pattern)
router.get('/missions/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const mission = await MissionService.getMissionById(req.params.id);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'fetching mission');
  }
});

// GET /starships/:starshipId/missions - Get missions by starship (OpenAPI pattern)
router.get('/starships/:starshipId/missions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Parse and validate pagination parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;

    // Parse filters
    const filters = validateData(MissionFiltersSchema, req.query, res, 'filters');
    if (!filters) return;

    // Parse sort options
    const sort = validateData(MissionSortSchema, req.query, res, 'sort');
    if (!sort) return;

    const result = await MissionService.getMissionsByStarshipId(req.params.starshipId, filters as MissionFilters, sort as MissionSort);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedMissions = result.missions.slice(startIndex, startIndex + limit);

    const paginationMeta = createPaginationMeta(page, limit, result.total);

    sendSuccess(res, paginatedMissions, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching starship missions');
  }
});

// GET /missions - List all missions with filtering and pagination (OpenAPI pattern)
router.get('/missions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    // Parse and validate pagination parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;

    // Parse filters
    const filters = validateData(MissionFiltersSchema, req.query, res, 'filters');
    if (!filters) return;

    // Parse sort options
    const sort = validateData(MissionSortSchema, req.query, res, 'sort');
    if (!sort) return;

    const result = await MissionService.getAllMissions(filters as MissionFilters, sort as MissionSort);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedMissions = result.missions.slice(startIndex, startIndex + limit);

    const paginationMeta = createPaginationMeta(page, limit, result.total);

    sendSuccess(res, paginatedMissions, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'listing missions');
  }
});

// POST /missions - Create new mission (OpenAPI pattern)
router.post('/missions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const createRequest = validateData(CreateMissionSchema, req.body, res, 'mission data');
    if (!createRequest) return;

    const userId = req.user!.id;
    const mission = await MissionService.createMission(createRequest as CreateMissionRequest, userId);

    sendSuccess(res, mission, 201);
  } catch (error) {
    handleError(error, res, 'creating mission');
  }
});

// PUT /missions/:id - Update mission (OpenAPI pattern)
router.put('/missions/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const updates = validateData(UpdateMissionSchema, req.body, res, 'mission updates');
    if (!updates) return;

    const mission = await MissionService.updateMission(req.params.id, updates as UpdateMissionRequest);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'updating mission');
  }
});

// DELETE /missions/:id - Delete mission (OpenAPI pattern)
router.delete('/missions/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    await MissionService.deleteMission(req.params.id);

    sendSuccess(res, { message: 'Mission deleted successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'deleting mission');
  }
});

// ============================================================================
// MISSION LIFECYCLE ENDPOINTS
// ============================================================================

// POST /missions/:id/start - Start a mission (OpenAPI pattern)
router.post('/missions/:id/start', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const mission = await MissionService.startMission(req.params.id);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'starting mission');
  }
});

// POST /missions/:id/complete - Complete a mission (OpenAPI pattern)
router.post('/missions/:id/complete', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const mission = await MissionService.completeMission(req.params.id);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'completing mission');
  }
});

// POST /missions/:id/fail - Fail a mission (OpenAPI pattern)
router.post('/missions/:id/fail', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const mission = await MissionService.failMission(req.params.id);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'failing mission');
  }
});

// POST /missions/:id/cancel - Cancel a mission (OpenAPI pattern)
router.post('/missions/:id/cancel', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const mission = await MissionService.cancelMission(req.params.id);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'cancelling mission');
  }
});

// PUT /missions/:id/phase - Update mission phase (OpenAPI pattern)
router.put('/missions/:id/phase', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const phaseValidation = validateData(
      z.object({
        phase: z.enum(['welcome', 'analysis', 'plan', 'execute', 'converse']),
      }),
      req.body,
      res,
      'phase data'
    );
    if (!phaseValidation) return;

    const mission = await MissionService.updateMissionPhase(req.params.id, phaseValidation.phase);

    sendSuccess(res, mission);
  } catch (error) {
    handleError(error, res, 'updating mission phase');
  }
});

// ============================================================================
// MISSION ANALYTICS ENDPOINTS
// ============================================================================

// GET /starships/:starshipId/missions/stats - Get mission statistics (OpenAPI pattern)
router.get('/starships/:starshipId/missions/stats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ starshipId: NanoidSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const stats = await MissionService.getMissionStats(req.params.starshipId);

    sendSuccess(res, stats);
  } catch (error) {
    handleError(error, res, 'fetching mission statistics');
  }
});

// GET /missions/:id/clarity - Get mission clarity assessment (OpenAPI pattern)
router.get('/missions/:id/clarity', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const clarity = await MissionService.getMissionClarity(req.params.id);

    if (!clarity) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Mission clarity assessment not found', 404, {
        resource: 'mission_clarity',
        missionId: req.params.id,
      });
      return;
    }

    sendSuccess(res, clarity);
  } catch (error) {
    handleError(error, res, 'fetching mission clarity');
  }
});

// ============================================================================
// MISSION WORKFLOW ENDPOINTS
// ============================================================================

// GET /missions/:id/workflow - Get mission workflow (OpenAPI pattern)
router.get('/missions/:id/workflow', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const workflow = await MissionService.getWorkflowByMissionId(req.params.id);

    if (!workflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Mission workflow not found', 404, {
        resource: 'mission_workflow',
        missionId: req.params.id,
      });
      return;
    }

    sendSuccess(res, workflow);
  } catch (error) {
    handleError(error, res, 'fetching mission workflow');
  }
});

// PUT /missions/:id/workflow/approval - Update workflow approval (OpenAPI pattern)
router.put('/missions/:id/workflow/approval', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!checkAuth(req, res)) return;

    const paramValidation = validateData(z.object({ id: NanoidSchema }), req.params, res, 'mission parameter');
    if (!paramValidation) return;

    const approvalValidation = validateData(
      z.object({
        approvalStatus: z.enum(['approved', 'rejected']),
        rejectionReason: z.string().optional(),
      }),
      req.body,
      res,
      'approval data'
    );
    if (!approvalValidation) return;

    const result = await MissionService.updateWorkflowApproval(req.params.id, approvalValidation);

    sendSuccess(res, result);
  } catch (error) {
    handleError(error, res, 'updating workflow approval');
  }
});

export default router;
