import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { AgentService } from '@/services/AgentService';
import { ConversationService } from '@/services/ConversationService';
import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { ConversationMemberRepository, DirectMessageRepository, StarshipMemberRepository } from '@starships/models';
import type { DirectMessageModel, AgentModel, ConversationModel } from '@starships/protocol';

const router: Router = Router();

/**
 * GET /starships/:starshipId/direct-messages
 *
 * Lists DMs visible to the current user (membership-based).
 */
router.get('/starships/:starshipId/direct-messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const dmRepo = new DirectMessageRepository();
    const dms = await dmRepo.listByStarshipForUser(params.starshipId, authUserId);

    const conversationService = new ConversationService();
    const agentService = new AgentService();

    const items: Array<{
      dm: DirectMessageModel;
      conversation: ConversationModel | null;
      agent: AgentModel | null;
    }> = [];

    for (const dm of dms) {
      const conversation = await conversationService.getConversationById(dm.conversationId).catch(() => null);
      const agent = dm.dmType === 'user_agent' && dm.agentId ? await agentService.getAgent(String(dm.agentId)).catch(() => null) : null;
      items.push({ dm, conversation, agent });
    }

    sendSuccess(res, { directMessages: items }, 200);
  } catch (error) {
    handleError(error, res, 'listing direct messages');
  }
});

/**
 * POST /starships/:starshipId/direct-messages
 *
 * Create (or return existing) DM.
 * Supports:
 * - user↔agent
 * - user↔user (peer must be in the starship)
 */
router.post('/starships/:starshipId/direct-messages', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const body = validateData(
      z
        .object({
          agentSlug: z.string().min(1).max(255).optional(),
          agentId: IdSchema.optional(),
          peerUserId: IdSchema.optional(),
          title: z.string().min(1).max(100).optional(),
        })
        .refine(
          (v) => {
            const hasAgent = Boolean(v.agentId || v.agentSlug);
            const hasPeerUser = Boolean(v.peerUserId);
            // exactly one target
            return (hasAgent && !hasPeerUser) || (!hasAgent && hasPeerUser);
          },
          {
            message: 'Provide either agentId/agentSlug OR peerUserId',
          }
        ),
      req.body,
      res,
      'direct message creation data'
    );
    if (!body) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const dmRepo = new DirectMessageRepository();
    const memberRepo = new ConversationMemberRepository();

    // Branch 1: user↔agent DM
    if (body.agentId || body.agentSlug) {
      const agentService = new AgentService();
      const agent = body.agentId
        ? await agentService.getAgent(body.agentId)
        : body.agentSlug
          ? await agentService.getAgentBySlug(body.agentSlug)
          : null;

      if (!agent) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', starshipId: params.starshipId });
        return;
      }
      if (agent.starshipId !== params.starshipId) {
        sendError(res, 'ACCESS_DENIED', 'Cannot create DM with an agent from a different starship', 403);
        return;
      }

      const existing = await dmRepo.findUserAgentDm(params.starshipId, authUserId, agent.id).catch(() => null);
      if (existing) {
        sendSuccess(res, { dm: existing, conversationId: existing.conversationId }, 200);
        return;
      }

      const conversationService = new ConversationService();
      const conversation = await conversationService.createConversation({
        title: body.title || `DM • ${agent.name}`,
        status: 'active',
        starshipId: params.starshipId,
        agentId: agent.id,
      });

      const dm = await dmRepo.create({
        conversationId: conversation.id,
        starshipId: params.starshipId,
        dmType: 'user_agent',
        userId: authUserId,
        agentId: agent.id,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt ?? conversation.createdAt,
      });

      await memberRepo.createOrIgnoreMember({
        conversationId: conversation.id,
        userId: authUserId,
        role: 'admin',
        createdBy: authUserId,
      });

      sendSuccess(res, { dm, conversationId: conversation.id }, 201);
      return;
    }

    // Branch 2: user↔user DM
    const peerUserId = String(body.peerUserId || '');
    if (!peerUserId) {
      sendError(res, 'VALIDATION_ERROR', 'peerUserId is required', 400);
      return;
    }
    if (peerUserId === authUserId) {
      sendError(res, 'VALIDATION_ERROR', 'Cannot create a direct message with yourself', 400);
      return;
    }

    const starshipService = new StarshipService();
    const starship = await starshipService.getStarship(params.starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: params.starshipId });
      return;
    }

    const starshipMemberRepo = new StarshipMemberRepository();
    const peerIsMember = peerUserId === starship.ownerId || (await starshipMemberRepo.isMember(peerUserId, params.starshipId));
    if (!peerIsMember) {
      sendError(res, 'ACCESS_DENIED', 'Cannot create DM with a user who is not a member of this starship', 403, {
        resource: 'starship_member',
        starshipId: params.starshipId,
        peerUserId,
      });
      return;
    }

    const userAId = authUserId.localeCompare(peerUserId) < 0 ? authUserId : peerUserId;
    const userBId = authUserId.localeCompare(peerUserId) < 0 ? peerUserId : authUserId;

    const existing = await dmRepo.findUserUserDm(params.starshipId, userAId, userBId).catch(() => null);
    if (existing) {
      sendSuccess(res, { dm: existing, conversationId: existing.conversationId }, 200);
      return;
    }

    const userService = new UserService();
    const peerUser = await userService.getUserById(peerUserId);
    if (!peerUser) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404, { resource: 'user', id: peerUserId });
      return;
    }

    const conversationService = new ConversationService();
    const peerLabel = peerUser.displayName || peerUser.email || 'User';
    const conversation = await conversationService.createConversation({
      title: body.title || `DM • ${peerLabel}`,
      status: 'active',
      starshipId: params.starshipId,
    });

    const dm = await dmRepo.create({
      conversationId: conversation.id,
      starshipId: params.starshipId,
      dmType: 'user_user',
      userAId,
      userBId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt ?? conversation.createdAt,
    });

    // Add both users to the backing conversation so listing + access checks work.
    await memberRepo.createOrIgnoreMember({
      conversationId: conversation.id,
      userId: authUserId,
      role: 'admin',
      createdBy: authUserId,
    });
    await memberRepo.createOrIgnoreMember({
      conversationId: conversation.id,
      userId: peerUserId,
      role: 'member',
      createdBy: authUserId,
    });

    sendSuccess(res, { dm, conversationId: conversation.id }, 201);
  } catch (error) {
    handleError(error, res, 'creating direct message');
  }
});

export default router;
