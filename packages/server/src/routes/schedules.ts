import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { ScheduleService } from '@/services/ScheduleService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';

const router: Router = Router();
const scheduleService = new ScheduleService();

const CronExpressionStringSchema = z
  .string()
  .min(1)
  .max(255)
  .superRefine((value, ctx) => {
    try {
      CronExpressionParser.parse(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid cron expression',
        path: ['cronExpression'],
      });
    }
  });

const CreateScheduleSchema = z.object({
  agentId: IdSchema,
  prompt: z.string().min(1).max(10000),
  cronExpression: CronExpressionStringSchema,
  timezone: z.string().min(1).max(255),
  nextRunAt: z.string().datetime(),
  isActive: z.boolean().default(true),
  isRecurring: z.boolean().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().positive().nullable().optional(),
});

const UpdateScheduleSchema = z.object({
  prompt: z.string().min(1).max(10000).optional(),
  cronExpression: CronExpressionStringSchema.optional(),
  timezone: z.string().min(1).max(255).optional(),
  nextRunAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().positive().nullable().optional(),
});

/**
 * POST /starships/:starshipId/schedules
 * Create a new schedule for a starship.
 */
router.post('/starships/:starshipId/schedules', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = z.object({ starshipId: IdSchema }).parse(req.params);
    const body = CreateScheduleSchema.parse(req.body);

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) {
      return;
    }

    const schedule = await scheduleService.createSchedule({
      starshipId: params.starshipId,
      agentId: body.agentId,
      ownerUserId: authUserId,
      prompt: body.prompt,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      nextRunAt: body.nextRunAt,
      isActive: body.isActive,
      isRecurring: body.isRecurring ?? false,
      endsAt: body.endsAt ?? null,
      maxOccurrences: body.maxOccurrences ?? null,
    });

    sendSuccess(res, schedule, 201);
  } catch (error) {
    handleError(error, res, 'creating schedule');
  }
});

/**
 * GET /starships/:starshipId/schedules
 * List schedules for a starship.
 */
router.get('/starships/:starshipId/schedules', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = z.object({ starshipId: IdSchema }).parse(req.params);

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) {
      return;
    }

    const schedules = await scheduleService.listStarshipSchedules(params.starshipId);
    sendSuccess(res, schedules, 200);
  } catch (error) {
    handleError(error, res, 'listing schedules');
  }
});

/**
 * PATCH /schedules/:scheduleId
 * Update schedule details.
 */
router.patch('/schedules/:scheduleId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = z.object({ scheduleId: IdSchema }).parse(req.params);
    const updates = UpdateScheduleSchema.parse(req.body);

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const existing = await scheduleService.getScheduleById(params.scheduleId);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Schedule not found', 404);
      return;
    }

    if (!(await verifyResourceAccess(existing.starshipId, authUserId, 'schedule', existing.id, res))) {
      return;
    }

    const updated = await scheduleService.updateSchedule(params.scheduleId, updates);
    if (!updated) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update schedule');
      return;
    }

    sendSuccess(res, updated, 200);
  } catch (error) {
    handleError(error, res, 'updating schedule');
  }
});

/**
 * DELETE /schedules/:scheduleId
 * Soft-deactivate a schedule.
 */
router.delete('/schedules/:scheduleId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = z.object({ scheduleId: IdSchema }).parse(req.params);

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const existing = await scheduleService.getScheduleById(params.scheduleId);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Schedule not found', 404);
      return;
    }

    if (!(await verifyResourceAccess(existing.starshipId, authUserId, 'schedule', existing.id, res))) {
      return;
    }

    const updated = await scheduleService.deactivateSchedule(params.scheduleId);
    if (!updated) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to deactivate schedule');
      return;
    }

    sendSuccess(res, { message: 'Schedule deactivated successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'deactivating schedule');
  }
});

export default router;
