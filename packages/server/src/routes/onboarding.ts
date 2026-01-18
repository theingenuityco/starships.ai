import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { StarshipService } from '@/services/StarshipService';
import { UserRepository, AgentRepository, StarshipRepository } from '@starships/models';
import type { AuthUser, StarshipModel, AgentModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const router: Router = Router();

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

    // Mark onboarding complete
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
