import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { OnboardingRecommendationService } from '@/services/OnboardingRecommendationService';
import { StarshipService } from '@/services/StarshipService';
import { ConversationService } from '@/services/ConversationService';
import { UserRepository, AgentRepository, StarshipRepository, OnboardingSessionRepository } from '@starships/models';
import type { AuthUser, StarshipModel, AgentModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();
const recommendationService = new OnboardingRecommendationService();

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

    // IMPORTANT:
    // Once a starship exists, onboarding should become optional (user can skip and return later).
    // Treat `onboardingCompleted` as "initial provisioning complete" rather than "finished every onboarding step".
    try {
      if (!dbUser.onboardingCompleted) {
        await userRepo.update(user.id, { onboardingCompleted: true });
      }
    } catch {
      // best-effort; do not block onboarding chat start
    }

    // Create or reuse an "Onboarding" conversation (normal conversation labeled onboarding)
    const conversationService = new ConversationService();
    const existing = await conversationService.getConversationsByStarshipWithAgents(starship.id);
    const onboardingConversation =
      (Array.isArray(existing)
        ? existing.find((c: unknown) => {
            const rec = c as Record<string, unknown> | null;
            const title = typeof rec?.title === 'string' ? rec.title : '';
            const status = typeof rec?.status === 'string' ? rec.status : '';
            return title.trim().toLowerCase() === 'onboarding' && status === 'active';
          })
        : null) || null;

    const conversation = onboardingConversation
      ? onboardingConversation
      : await conversationService.createConversation({
          title: 'Onboarding',
          status: 'active',
          starshipId: starship.id,
          agentId: aria.id,
        });

    // Inject onboarding-only system prompt (conversation-scoped).
    // This keeps Aria's template prompt generic while customizing behavior for onboarding conversations.
    const onboardingSystemPrompt = [
      'You are starting a new onboarding conversation with a user for their starship.',
      '',
      'Work one step at a time (turn-based):',
      '- Do NOT ask clarifying questions and suggest connectors in the same message.',
      '- If the task is vague, ask ONLY clarifying question(s) and stop. Wait for the user reply before suggesting connectors.',
      '',
      'First message:',
      '- Warmly introduce yourself as Aria.',
      '- Welcome them.',
      '- Ask a brief question about their starship/company/organization/project (what they do and what they want to build).',
      '- Immediately call Render Starship Details (tool slug: render-starship-details) to render the StarshipDetails widget so they can fill/update name, description, and website URL.',
      '- After the widget is rendered, ask what task/outcome they want to get done (what success looks like).',
      '- Include 3-5 examples of tasks (examples only; do not suggest connectors yet), like:',
      '  - “Summarize and prioritize new Slack messages into a daily brief”',
      '  - “Turn my Stripe revenue into weekly KPI charts”',
      '  - “Answer questions about our Notion knowledge base”',
      '  - “Track GitHub PRs/issues and report status updates”',
      '  - “Automate recurring customer support triage”',
      '',
      'Clarifying questions (ONLY if the task is EXTREMELY vague):',
      '- “Not vague” examples (do NOT ask clarifying questions; proceed to list-connectors next):',
      '  - “Turn my Stripe revenue into weekly KPI charts”',
      '  - “Track GitHub PRs and summarize status daily”',
      '  - “Answer questions about our Notion knowledge base”',
      '- “Extremely vague” examples (ask clarifying question(s) and stop):',
      '  - “Create some UI”',
      '  - “Help me with my business”',
      '  - “Make this better”',
      '- When you do ask clarifying questions:',
      '  - Ask the minimum number of questions needed to make the task actionable.',
      '  - Focus on: goal, apps/data involved, and any constraints (deadline/audience/format).',
      '  - End the message after questions. Do not suggest connectors yet.',
      '',
      'After the user answers (task is clear): suggest connectors:',
      '- First call List Connectors (tool slug: list-connectors) to understand what connectors are available/connected and whether the task is feasible.',
      '- If the task is not feasible due to missing connectors, say what is missing and ask the user whether they want to connect those apps.',
      '- If the user mentions apps, then call Suggest Connectors (tool slug: suggest-connectors) with the relevant providers.',
      '- If the user does not mention apps, ask one concise question listing a few common apps, then suggest connectors based on their answer.',
      '',
      'After suggesting connectors: verify connection, then suggest agents:',
      '- Do NOT suggest agents until the relevant connector(s) are actually connected.',
      '- Ask the user to connect the suggested app(s), then confirm when done.',
      '- When the user says they connected it, call List Connectors (list-connectors) again and verify the connector is connected.',
      '- If still not connected, explain what is missing and ask them to complete the connection first.',
      '- Once connected:',
      '  - Call List Agents (tool slug: list-agents) to see if an already-deployed agent on the starship can handle the task.',
      '  - If a relevant deployed agent exists, suggest using it (and offer to proceed).',
      '  - If no relevant deployed agent exists, call List Agents From Marketplace (tool slug: list-agents-from-marketplace), pick 2–3 relevant templates, then call Suggest Agents (tool slug: suggest-agents) with templateSlugs.',
      '',
      'Keep it warm, concise, and action-oriented.',
    ].join('\\n');

    try {
      const prevState =
        (conversation as unknown as { state?: unknown })?.state &&
        typeof (conversation as unknown as { state?: unknown }).state === 'object'
          ? ((conversation as unknown as { state: Record<string, unknown> }).state as Record<string, unknown>)
          : {};
      await conversationService.updateConversation(conversation.id, {
        state: { ...(prevState as Record<string, unknown>), onboardingSystemPrompt },
      });
    } catch {
      // non-fatal
    }

    // Kick off the first assistant message so the user sees Aria immediately without any hardcoded greeting.
    // IMPORTANT: best-effort only; never fail onboarding start if kickoff fails.
    try {
      // Avoid spamming: only kick off if there are no assistant messages yet.
      const existingMessages = await conversationService.getConversationMessages(conversation.id).catch(() => []);
      const hasAssistant =
        Array.isArray(existingMessages) &&
        existingMessages.some((m: unknown) => {
          const rec = m as Record<string, unknown> | null;
          return rec != null && rec['role'] === 'assistant';
        });
      if (!hasAssistant) {
        await conversationService.continueAfterToolApproval(conversation.id, aria.id, { authContext: { userId: user.id } });
      }
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

    const userRepo = new UserRepository();
    const dbUser = await userRepo.findById(user.id);
    if (!dbUser) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'User not found', 404);
      return;
    }

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

    // Auto-provision: if the user is not onboarded yet, ensure they have a starship and that the onboarding
    // session points at it. This enables the client to auto-resume onboarding chat without a manual click.
    if (!dbUser.onboardingCompleted && !session.starshipId) {
      let starship: StarshipModel | null = null;
      try {
        const starshipRepo = new StarshipRepository();
        const userStarships = await starshipRepo.findByOwner(user.id);
        starship = userStarships.find((s) => s.status === 'active') || userStarships[0] || null;
      } catch {
        // ignore - will fall back to provisioning
      }

      if (!starship) {
        starship = await ensureStarshipForUser(user.id);
      }

      session = await sessionRepo.upsertForUser(user.id, {
        ...session,
        starshipId: starship.id,
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

export default router;
