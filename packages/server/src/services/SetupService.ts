import { UserRepository } from '@starships/models';
import { logger } from '@starships/models';
import { ConflictError } from '../errors';
import { StarshipService } from './StarshipService';
import { ServiceFactory } from './ServiceFactory';
import { generateJWT } from '@/utils/jwt';
import type { StarshipModel, UserModel } from '@starships/protocol';

export interface SetupInitRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface SetupStatusResult {
  setupRequired: boolean;
}

export interface SetupInitResult {
  user: {
    id: string;
    email: string;
    name: string;
    isInstanceAdmin: boolean;
    wizardOnboardingCompleted: boolean;
  };
  token: string;
  starship: { id: string; slug: string; name: string } | null;
}

export class SetupService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getStatus(): Promise<SetupStatusResult> {
    const hasAdmin = await this.userRepository.hasAnyAdmin();
    return { setupRequired: !hasAdmin };
  }

  async initializeInstance(data: SetupInitRequest): Promise<SetupInitResult> {
    // TODO: concurrent calls can race past this guard — both reads see hasAdmin=false and proceed.
    // A DB-level unique partial index on is_instance_admin=true would enforce the invariant atomically.
    const hasAdmin = await this.userRepository.hasAnyAdmin();
    if (hasAdmin) {
      throw new ConflictError('Instance is already initialized. An admin user exists.');
    }

    const userService = ServiceFactory.createUserService();
    const displayName = data.displayName?.trim() || data.email.split('@')[0];

    const user = await userService.createUser({
      email: data.email,
      password: data.password,
      displayName,
      // Force email verified — email may not be configured on a fresh deploy.
      emailVerified: true,
    });

    let createdStarship: StarshipModel | null = null;
    try {
      createdStarship = await StarshipService.createDefaultStarship(user.id);
    } catch (error) {
      // Compensating rollback — user is not yet admin, so a simple delete suffices.
      try {
        await userService.deleteUser(user.id);
      } catch {
        // Ignore cleanup errors; surface original failure.
      }
      logger.error('[SetupService] Failed to create default starship during instance init', {
        userId: user.id,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Elevate to instance admin only after starship creation succeeds,
    // so a rollback on starship failure never leaves an orphaned admin user.
    const updatedUser = (await this.userRepository.update(user.id, { isInstanceAdmin: true })) as UserModel;

    const token = await generateJWT({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.displayName || updatedUser.email?.split('@')[0],
    });

    const starship = createdStarship
      ? { id: createdStarship.id, slug: createdStarship.slug, name: createdStarship.name }
      : null;

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email!,
        name: updatedUser.displayName || updatedUser.email!.split('@')[0],
        isInstanceAdmin: true,
        wizardOnboardingCompleted: false,
      },
      token,
      starship,
    };
  }
}
