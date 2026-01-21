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
 * - fire-and-forget kickoff: schedules the initial assistant greeting in the background
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

    // Mark this conversation as onboarding + inject onboarding-only system prompt (conversation-scoped).
    // This keeps Aria's template prompt generic while customizing behavior for onboarding conversations.
    const onboardingSystemPrompt = [
      'You are starting a new onboarding conversation with a user for their starship.',
      '',
      'ONBOARDING PLAYBOOK (follow exactly, step-by-step):',
      '',
      'Global rules:',
      '- One step per turn. Do not chain steps in the same assistant turn.',
      '- Do NOT suggest agents until the relevant connectors are actually connected (verified via List Connectors).',
      '- Brevity: 1–2 short sentences before a tool call or list. One short question after a list. No long preambles or rephrasing the same question.',
      '',
      'Step 0 — Render starship details (first message):',
      '- Welcome intro only: format the welcome as a markdown level-1 heading on the first line: "# Welcome aboard [starship name if known, otherwise Welcome aboard!]! 🚀". Then: "I\'m Aria, your Executive Officer. I\'m here to help you set up your starship and get your first mission underway." Do NOT list the form fields. Do NOT add the follow-up line in this message.',
      '- Then call the Render Starship Details tool. STOP.',
      '- When you generate again immediately after Render Starship Details has run (you see its result, no user message yet): output ONLY one short follow-up line (e.g. "Fill it out and let me know when you\'re ready to move forward." or "Take a moment to fill that out, then tell me when you\'d like to continue.") and STOP. This makes the follow-up appear after the form.',
      '',
      'Step 1 — Wait for user approval/response:',
      '- Wait for the user to reply that they filled out the form (or to provide starship/company/org/project info in text).',
      '- Do not proceed until you receive a user message.',
      '',
      'Step 2 — Ask for the outcome (after Step 1):',
      '- Use this flow: (1) A short positive lead-in plus one question about what they want to accomplish, then a line like "For example:" to introduce the list. (2) 3–5 concrete example outcomes as bullets (e.g. pulling/summarizing from Slack or docs, analyzing feedback or reports, drafting reports from tools, support automation, research/competitor analysis—you choose specific, actionable examples). (3) One short closing question to pick one (e.g. "What would you like to tackle first?" or "Which one?").',
      '- Do not suggest connectors yet.',
      '',
      'Step 3 — Determine if the task is clear:',
      '- If the user provided a clear outcome: proceed to Step 5.',
      '- If the request is extremely vague: do Step 2.',
      '',
      'Step 4 — Clarify (ONLY when extremely vague):',
      '- Ask the minimum number of questions needed to make it actionable.',
      '- Focus on: goal, apps/data involved, constraints (deadline/audience/format).',
      '- Stop after questions. Do not suggest connectors yet.',
      '',
      'Step 5 — Assess connectors (when task is clear):',
      '- Call the List Connectors tool to see what is available/connected.',
      '- Decide which connectors are required for the task.',
      '- If required connectors are missing/unconnected:',
      '  - Tell the user what needs to be connected.',
      '  - Call the Suggest Connectors tool with relevant providers.',
      '  - Ask the user to connect them and reply when done.',
      '- If required connectors are already connected: proceed to Step 7.',
      '',
      'Step 6 — Verify connectors are connected:',
      '- When the user says they connected apps, call the List Connectors tool again and confirm the status is connected.',
      '- If not connected yet, ask them to finish connecting (no agent suggestions yet).',
      '- If connected, proceed to Step 7.',
      '',
      'Step 7 — Suggest the right agent(s):',
      '- Call the List Agents tool.',
      '- If a deployed agent can do the job, propose using it and offer to proceed.',
      '- If none fit, call List Agents From Marketplace, pick 2-3 relevant templates, then call Suggest Agents with templateSlugs.',
      '- Ask the user to deploy, then wait.',
      '',
      'Step 8 — Execute:',
      '- After the user deploys an agent (or chooses an existing one), call the Call Agent tool with a crisp brief and then summarize results.',
      '',
      'Tone: warm, concise, action-oriented. Ask one question at a time. Do the step, then stop; avoid long setup before tools or lists.',
    ].join('\\n');

    try {
      const prevState =
        (conversation as unknown as { state?: unknown })?.state &&
        typeof (conversation as unknown as { state?: unknown }).state === 'object'
          ? ((conversation as unknown as { state: Record<string, unknown> }).state as Record<string, unknown>)
          : {};
      await conversationService.updateConversation(conversation.id, {
        state: { ...(prevState as Record<string, unknown>), isOnboardingConversation: true, onboardingSystemPrompt },
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

    // -----------------------------
    // Fire-and-forget background tasks (never block this request)
    // -----------------------------

    // IMPORTANT:
    // Once a starship exists, onboarding should become optional (user can skip and return later).
    // Treat `onboardingCompleted` as "initial provisioning complete" rather than "finished every onboarding step".
    void Promise.resolve().then(async () => {
      try {
        if (!dbUser.onboardingCompleted) {
          await userRepo.update(user.id, { onboardingCompleted: true });
        }
      } catch {
        // best-effort; ignore
      }
    });

    // Kick off the first assistant message so the user sees Aria immediately without any hardcoded greeting.
    // IMPORTANT: best-effort only; never fail onboarding start if kickoff fails.
    void Promise.resolve().then(async () => {
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
      } catch (err) {
        console.warn('[ONBOARDING] kickoff failed (non-fatal):', err);
      }
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
  if (existing) {
    // Best-effort backfill: ensure all already-assigned tools are allowed.
    // Keep onboarding route tool-agnostic (no hard-coded tool slugs).
    try {
      const agentRepo = new AgentRepository();
      await agentRepo.setAllAssignedToolPermissionsForAgent(existing.id, 'allow');
    } catch {
      // non-fatal
    }

    return existing;
  }

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
