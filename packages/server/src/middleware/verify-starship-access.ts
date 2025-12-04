import { Response } from 'express';
import { StarshipService } from '@/services/StarshipService';
import { UserService } from '@/services/UserService';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { sendError } from '@/utils/responseHelpers';

/**
 * Verifies that a user has access to a starship (ownership check)
 */
export async function verifyStarshipAccess(
  starshipId: string,
  userId: string,
  res: Response
): Promise<boolean> {
  const starshipService = new StarshipService();
  const userService = new UserService();
  const starship = await starshipService.getStarship(starshipId);
  const user = await userService.getUserById(userId);

  if (!starship) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
      resource: 'starship',
      id: starshipId,
    });
    return false;
  }

  if (starship.ownerId !== userId && !isInstanceAdmin(user)) {
    sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403, {
      resource: 'starship',
      id: starshipId,
      reason: 'not_owner',
    });
    return false;
  }

  return true;
}

/**
 * Verifies that a resource (agent/tool/conversation) belongs to a starship the user owns
 */
export async function verifyResourceAccess(
  resourceStarshipId: string,
  userId: string,
  resourceType: string,
  resourceId: string,
  res: Response
): Promise<boolean> {
  const starshipService = new StarshipService();
  const userService = new UserService();
  const starship = await starshipService.getStarship(resourceStarshipId);
  const user = await userService.getUserById(userId);

  if (!starship) {
    sendError(
      res,
      'RESOURCE_NOT_FOUND',
      `${resourceType} belongs to non-existent starship`,
      404,
      {
        resource: resourceType,
        id: resourceId,
      }
    );
    return false;
  }

  if (starship.ownerId !== userId && !isInstanceAdmin(user)) {
    sendError(res, 'ACCESS_DENIED', `Access denied to this ${resourceType}`, 403, {
      resource: resourceType,
      id: resourceId,
      reason: 'not_owner',
    });
    return false;
  }

  return true;
}


