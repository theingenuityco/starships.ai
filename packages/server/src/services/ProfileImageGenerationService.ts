/**
 * ProfileImageGenerationService
 *
 * STUB: previously generated agent profile images via the autopilot DAG image node
 * (run through the remote runner). The DAG engine was removed; this is temporarily
 * disabled and throws. Reimplement as a direct OpenRouter image-generation call.
 */
import type { AgentModel } from '@starships/protocol';
import { AppError } from '@starships/errors';

export type ProfileImageType = 'problem_statements' | 'capabilities' | 'try_these_prompts';

export type ProfileImageGenerationResult = {
  /** data URL from OpenRouter: data:image/png;base64,... */
  dataUrl: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional text caption returned by model */
  text?: string;
  /** Model used */
  model: string;
};

const DISABLED =
  'Profile image generation is temporarily disabled (DAG engine removed); reimplement as a direct OpenRouter image call.';

export class ProfileImageGenerationService {
  async generateProfileImage(
    _agent: AgentModel,
    _type: ProfileImageType,
    _params?: {
      coreCapabilities?: string;
      domainContext?: string;
      engineConfigFromHost?: Record<string, unknown>;
    }
  ): Promise<ProfileImageGenerationResult> {
    throw new AppError(DISABLED, 'NOT_IMPLEMENTED', 501);
  }
}
