import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { OnboardingRecommendationService } from '@/services/OnboardingRecommendationService';
import { StarshipService } from '@/services/StarshipService';
import { ConversationService } from '@/services/ConversationService';
import { MessageService } from '@/services/MessageService';
import { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { ConnectorService } from '@/services/ConnectorService';
import { UIActionService } from '@/services/UIActionService';
import { UserRepository, AgentRepository, StarshipRepository, OnboardingSessionRepository } from '@starships/models';
import type { AuthUser, StarshipModel, AgentModel, OnboardingConnectorsUIAction } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();
const recommendationService = new OnboardingRecommendationService();

type OnboardingChoice = { id: string; label: string; messageText: string };

function getSourceTemplateId(agent: AgentModel): string | null {
  const rec = agent as unknown as Record<string, unknown>;
  const v = rec['sourceTemplateId'];
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function requireAuthUser(req: Request, res: Response): AuthUser | null {
  const user = req.user as AuthUser | null | undefined;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return user;
}

const CompleteOnboardingSchema = z.object({
  starshipName: z.string().trim().min(1).max(100).optional(),
});

const StartOnboardingSchema = z.object({
  starshipName: z.string().trim().min(1).max(100).optional(),
});

/**
 * POST /onboarding/chat/start
 *
 * Conversation-driven onboarding:
 * - requires explicit user action (this endpoint call)
 * - creates starship + deploys Aria
 * - creates or reuses an "Onboarding" conversation
 * - posts an initial assistant greeting + emits option chips via ui_action
 */
router.post('/onboarding/chat/start', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(StartOnboardingSchema, req.body, res, 'onboarding chat start payload');
    if (!body) return;

    // Ensure starship + Aria
    const sessionRepo = new OnboardingSessionRepository();
    const userRepo = new UserRepository();
    const dbUser = await userRepo.findById(user.id);
    if (!dbUser) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    // Ensure session exists atomically without resetting existing state.
    let session = await sessionRepo.ensureForUser(user.id);

    let starship: StarshipModel | null = null;
    if (session.starshipId) {
      const starshipRepo = new StarshipRepository();
      starship = await starshipRepo.findById(session.starshipId);
    }
    if (!starship) {
      starship = await ensureStarshipForUser(user.id, body.starshipName);
    }

    const aria = await ensureAriaOnStarship(starship.id);

    // Upsert session with starship
    session = await sessionRepo.upsertForUser(user.id, {
      ...session,
      starshipId: starship.id,
      step: 'connectors',
    });

    // Create or reuse an "Onboarding" conversation (normal conversation labeled onboarding)
    const conversationService = new ConversationService();
    const existing = await conversationService.getConversationsByStarshipWithAgents(starship.id);
    const onboardingConversation =
      (Array.isArray(existing)
        ? existing.find(
            (c: any) =>
              String(c?.title || '')
                .trim()
                .toLowerCase() === 'onboarding' && String(c?.status || '') === 'active'
          )
        : null) || null;

    const conversation = onboardingConversation
      ? onboardingConversation
      : await conversationService.createConversation({
          title: 'Onboarding',
          status: 'active',
          starshipId: starship.id,
          agentId: aria.id,
        });

    // Build initial connector suggestions from live connector catalog.
    const connectorService = new ConnectorService();
    const catalog = await connectorService.getConnectorCatalog();
    const providers: string[] = (catalog || [])
      .slice(0, 12)
      .map((c: any) => String(c?.provider || '').trim())
      .filter((p) => p.length > 0 && p !== 'starships');

    // Persist a lightweight onboarding UI state on the conversation for durability
    try {
      await conversationService.updateConversation(conversation.id, {
        state: {
          onboarding: {
            mode: 'conversation',
            step: 'connectors',
            providers,
          },
        },
      });
    } catch {
      // non-fatal
    }

    // Create a greeting assistant message (durable) and publish + emit ui_action choices (live)
    const bus = ConversationStreamBus.getInstance();
    const uiActions = new UIActionService(bus);
    try {
      const messageService = new MessageService();
      const greeting = await messageService.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        messageType: 'agent_response',
        agentId: aria.id,
        agentName: aria.name,
        content: `Welcome! Let’s start by connecting the apps you already use.\n\nPick one (or a few) connectors below — I’ll use live data to tailor the rest of onboarding.`,
      });
      await bus.publish(conversation.id, { type: 'message.append', data: { conversationId: conversation.id, message: greeting } });
    } catch {
      // non-fatal
    }

    try {
      // NOTE: legacy UI action shape removed; UI actions are now { action, payload }.
      await uiActions.publish(conversation.id, {
        action: 'onboarding_connectors',
        payload: { conversationId: conversation.id, providers },
      });
    } catch {
      // non-fatal
    }

    sendSuccess(res, {
      session,
      starship: { id: starship.id, slug: starship.slug, name: starship.name },
      ariaAgent: { id: aria.id, slug: aria.slug, name: aria.name },
      conversation: { id: conversation.id, title: conversation.title },
    });
  } catch (error) {
    handleError(error, res, 'start onboarding chat');
  }
});

const RecommendationsSchema = z.object({
  goals: z.array(z.enum(['research', 'analytics', 'support', 'automation', 'tool_building'])).min(1),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

const ApplySchema = z.object({
  selectedAgentTemplateIds: z.array(z.string().min(1)).default([]),
  primaryAgentTemplateId: z.string().min(1).optional().nullable(),
});

const AriaSuggestSchema = z.object({
  step: z.enum(['welcome', 'goals', 'connectors', 'agents', 'first_task', 'done']),
  goals: z.array(z.enum(['research', 'analytics', 'support', 'automation', 'tool_building'])).optional(),
  userNotes: z.string().max(4000).optional(),
});

async function ensureStarshipForUser(userId: string, starshipName?: string): Promise<StarshipModel> {
  if (starshipName && starshipName.trim().length > 0) {
    const svc = new StarshipService();
    return await svc.createStarship({
      ownerId: userId,
      name: starshipName.trim(),
      shipClass: 'scout',
      initialCredits: 200,
    });
  }
  return await StarshipService.createDefaultStarship(userId);
}

async function ensureAriaOnStarship(starshipId: string): Promise<AgentModel> {
  const starshipRepo = new StarshipRepository();
  const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
  const existing = deployedAgents.find((a) => typeof a.slug === 'string' && a.slug.toLowerCase().startsWith('aria'));
  if (existing) return existing;

  const templateService = new AgentTemplateService();
  const ariaCandidates = await templateService.searchTemplates('Aria');
  const ariaTemplate = ariaCandidates.find((t) => t.name === 'Aria') || null;
  if (!ariaTemplate) {
    throw new Error('Default agent template (Aria) not found');
  }
  const ariaAgent = await templateService.createAgentFromTemplate(ariaTemplate.id, starshipId);
  try {
    const agentRepo = new AgentRepository();
    await agentRepo.setAllAssignedToolPermissionsForAgent(ariaAgent.id, 'allow');
  } catch {
    // non-fatal
  }
  return ariaAgent;
}

/**
 * POST /onboarding/start
 *
 * Initializes onboarding:
 * - ensures starship exists
 * - ensures Aria is deployed
 * - creates/returns onboarding session
 *
 * NOTE: Does NOT mark users.onboarding_completed=true. That happens in /onboarding/finish.
 */
router.post('/onboarding/start', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(StartOnboardingSchema, req.body, res, 'onboarding start payload');
    if (!body) return;

    const userRepo = new UserRepository();
    const dbUser = await userRepo.findById(user.id);
    if (!dbUser) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    const sessionRepo = new OnboardingSessionRepository();
    let session = await sessionRepo.findByUserId(user.id);

    let starship: StarshipModel | null = null;
    if (session?.starshipId) {
      const starshipRepo = new StarshipRepository();
      starship = await starshipRepo.findById(session.starshipId);
    }

    if (!starship) {
      starship = await ensureStarshipForUser(user.id, body.starshipName);
    }

    const aria = await ensureAriaOnStarship(starship.id);

    // Create or refresh session
    session = await sessionRepo.upsertForUser(user.id, {
      starshipId: starship.id,
      step: session?.step ?? 'welcome',
      goals: session?.goals ?? [],
      selectedConnectorProviders: session?.selectedConnectorProviders ?? [],
      selectedAgentTemplateIds: session?.selectedAgentTemplateIds ?? [],
      primaryAgentTemplateId: session?.primaryAgentTemplateId ?? null,
      completedAt: session?.completedAt ?? null,
      createdAt: session?.createdAt,
    });

    sendSuccess(res, {
      session,
      starship: { id: starship.id, slug: starship.slug, name: starship.name },
      ariaAgent: { id: aria.id, slug: aria.slug, name: aria.name },
    });
  } catch (error) {
    handleError(error, res, 'start onboarding');
  }
});

/**
 * GET /onboarding/session
 */
router.get('/onboarding/session', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const sessionRepo = new OnboardingSessionRepository();
    let session = await sessionRepo.findByUserId(user.id);

    // First-time users may not have started onboarding yet.
    // Return a default session instead of a 404 so the client can render the wizard.
    if (!session) {
      session = await sessionRepo.upsertForUser(user.id, {
        starshipId: null,
        step: 'welcome',
        goals: [],
        selectedConnectorProviders: [],
        selectedAgentTemplateIds: [],
        primaryAgentTemplateId: null,
        completedAt: null,
      });
    }

    sendSuccess(res, { session });
  } catch (error) {
    handleError(error, res, 'get onboarding session');
  }
});

/**
 * POST /onboarding/recommendations
 */
router.post('/onboarding/recommendations', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(RecommendationsSchema, req.body, res, 'onboarding recommendations');
    if (!body) return;

    const sessionRepo = new OnboardingSessionRepository();
    const session = await sessionRepo.findByUserId(user.id);
    if (!session || !session.starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Onboarding session or starship not found', 404);
      return;
    }

    // Persist goals and step
    const nextSession = await sessionRepo.upsertForUser(user.id, {
      ...session,
      goals: body.goals,
      step: 'connectors',
    });

    const rec = await recommendationService.getRecommendations(session.starshipId, body.goals);
    sendSuccess(res, { session: nextSession, ...rec });
  } catch (error) {
    handleError(error, res, 'get onboarding recommendations');
  }
});

/**
 * POST /onboarding/aria/suggest
 *
 * Hybrid onboarding: structured guidance for the right-side Aria panel.
 * Deterministic implementation (no agent calls) for now.
 */
router.post('/onboarding/aria/suggest', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(AriaSuggestSchema, req.body, res, 'aria suggest');
    if (!body) return;

    const sessionRepo = new OnboardingSessionRepository();
    const session = await sessionRepo.findByUserId(user.id);
    if (!session || !session.starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Onboarding session or starship not found', 404);
      return;
    }

    const goals = body.goals ?? session.goals ?? [];
    const rec =
      goals.length > 0
        ? await recommendationService.getRecommendations(session.starshipId, goals)
        : { connectors: [], recommendedConnectorProviders: [], recommendedAgentTemplates: [] };

    const explanationMarkdown =
      goals.length === 0
        ? `Tell me what you want to do and I’ll recommend a minimal crew and any required connectors.`
        : `Based on your goals (${goals.join(', ')}), here are the connectors to consider and a minimal set of agents to deploy.`;

    sendSuccess(res, {
      explanationMarkdown,
      recommendedConnectorProviders: rec.recommendedConnectorProviders,
      recommendedAgentTemplates: rec.recommendedAgentTemplates,
    });
  } catch (error) {
    handleError(error, res, 'aria suggest');
  }
});

/**
 * POST /onboarding/apply
 *
 * Deploys the user-selected agent templates onto the onboarding starship.
 */
router.post('/onboarding/apply', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(ApplySchema, req.body, res, 'onboarding apply');
    if (!body) return;

    const sessionRepo = new OnboardingSessionRepository();
    const session = await sessionRepo.findByUserId(user.id);
    if (!session || !session.starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Onboarding session or starship not found', 404);
      return;
    }

    const starshipId = session.starshipId;
    const starshipRepo = new StarshipRepository();
    const deployed = await starshipRepo.getDeployedAgents(starshipId);

    const templateService = new AgentTemplateService();
    const createdAgents: AgentModel[] = [];

    for (const templateId of body.selectedAgentTemplateIds || []) {
      // Skip if already deployed from this template
      const exists = deployed.find((a) => getSourceTemplateId(a) === String(templateId));
      if (exists) continue;
      try {
        const agent = await templateService.createAgentFromTemplate(templateId, starshipId);
        createdAgents.push(agent);
      } catch {
        // Continue deploying remaining selections
      }
    }

    const nextSession = await sessionRepo.upsertForUser(user.id, {
      ...session,
      selectedAgentTemplateIds: body.selectedAgentTemplateIds,
      primaryAgentTemplateId: body.primaryAgentTemplateId ?? null,
      step: 'first_task',
    });

    sendSuccess(res, {
      session: nextSession,
      deployedAgents: createdAgents.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        sourceTemplateId: getSourceTemplateId(a),
      })),
    });
  } catch (error) {
    handleError(error, res, 'apply onboarding selection');
  }
});

/**
 * POST /onboarding/finish
 *
 * Marks onboarding as complete and sets users.onboarding_completed=true.
 */
router.post('/onboarding/finish', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const userRepo = new UserRepository();
    const sessionRepo = new OnboardingSessionRepository();
    const session = await sessionRepo.findByUserId(user.id);
    if (!session || !session.starshipId) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Onboarding session or starship not found', 404);
      return;
    }

    const starshipRepo = new StarshipRepository();
    const starship = await starshipRepo.findById(session.starshipId);
    if (!starship) {
      sendError(res, 'STARSHIP_NOT_FOUND', 'Starship not found', 404);
      return;
    }

    // Determine primary agent: chosen template, otherwise Aria.
    const deployedAgents = await starshipRepo.getDeployedAgents(starship.id);
    let primary = null as AgentModel | null;
    if (session.primaryAgentTemplateId) {
      primary = deployedAgents.find((a) => getSourceTemplateId(a) === String(session.primaryAgentTemplateId)) || null;
    }
    if (!primary) {
      primary = deployedAgents.find((a) => typeof a.slug === 'string' && a.slug.toLowerCase().startsWith('aria')) || null;
    }
    if (!primary) {
      sendError(res, 'RESOURCE_CONFLICT', 'No primary agent available to start chat.', 409);
      return;
    }

    const now = new Date().toISOString();
    const nextSession = await sessionRepo.upsertForUser(user.id, {
      ...session,
      step: 'done',
      completedAt: now,
    });

    await userRepo.update(user.id, { onboardingCompleted: true });

    sendSuccess(res, {
      session: nextSession,
      starship: { id: starship.id, slug: starship.slug, name: starship.name },
      primaryAgent: { id: primary.id, slug: primary.slug, name: primary.name },
    });
  } catch (error) {
    handleError(error, res, 'finish onboarding');
  }
});

/**
 * POST /onboarding/complete
 *
 * Mandatory onboarding for new users.
 * Creates:
 * - a new starship (Scout, 200 welcome credits)
 * - the default agent (Aria) on that starship
 * - tool permissions for Aria
 * Then marks users.onboarding_completed = true.
 */
router.post('/onboarding/complete', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;

    const body = validateData(CompleteOnboardingSchema, req.body, res, 'onboarding payload');
    if (!body) return;

    const userRepo = new UserRepository();
    const starshipRepo = new StarshipRepository();

    // Ensure we read the freshest user record (req.user may be stale vs DB).
    const dbUser = await userRepo.findById(user.id);
    if (!dbUser) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

    // Idempotent behavior: if already onboarded, return the first active starship + aria* if present.
    if (dbUser.onboardingCompleted) {
      const ships = await starshipRepo.findByOwner(user.id);
      const starship = ships.find((s) => s.status === 'active') || ships[0] || null;
      if (!starship) {
        sendError(res, 'RESOURCE_CONFLICT', 'Onboarding already completed but no starship exists.', 409);
        return;
      }
      const deployedAgents = await starshipRepo.getDeployedAgents(starship.id);
      const aria = deployedAgents.find((a) => typeof a.slug === 'string' && a.slug.toLowerCase().startsWith('aria')) || null;

      sendSuccess(res, {
        starship: { id: starship.id, slug: starship.slug, name: starship.name },
        agent: aria ? { id: aria.id, slug: aria.slug, name: aria.name } : null,
      });
      return;
    }

    // Create starship (explicit name if provided, otherwise generated)
    let starship: StarshipModel;
    if (body.starshipName) {
      const starshipService = new StarshipService();
      starship = await starshipService.createStarship({
        ownerId: user.id,
        name: body.starshipName,
        shipClass: 'scout',
        initialCredits: 200,
      });
    } else {
      starship = await StarshipService.createDefaultStarship(user.id);
    }

    // Create Aria from template
    const templateService = new AgentTemplateService();
    const ariaCandidates = await templateService.searchTemplates('Aria');
    const ariaTemplate = ariaCandidates.find((t) => t.name === 'Aria') || null;
    if (!ariaTemplate) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Default agent template (Aria) not found', 404);
      return;
    }

    const ariaAgent: AgentModel = await templateService.createAgentFromTemplate(ariaTemplate.id, starship.id);

    // Allow all assigned tool permissions for Aria
    try {
      const agentRepo = new AgentRepository();
      await agentRepo.setAllAssignedToolPermissionsForAgent(ariaAgent.id, 'allow');
    } catch {
      // Non-fatal: agent exists; user can still proceed.
    }

    // Mark onboarding complete (legacy endpoint)
    await userRepo.update(user.id, { onboardingCompleted: true });

    sendSuccess(res, {
      starship: { id: starship.id, slug: starship.slug, name: starship.name },
      agent: { id: ariaAgent.id, slug: ariaAgent.slug, name: ariaAgent.name },
    });
  } catch (error) {
    handleError(error, res, 'complete onboarding');
  }
});

export default router;
