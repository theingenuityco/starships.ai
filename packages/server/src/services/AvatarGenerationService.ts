/**
 * AvatarGenerationService
 *
 * STUB: previously generated avatar images + mirror descriptions via the autopilot
 * DAG LLM/image nodes (run through the remote runner). The DAG engine was removed;
 * these methods are temporarily disabled and throw. Reimplement as direct OpenRouter
 * image-generation calls.
 */
import type { Blueprint } from '@starships/protocol';
import { AppError } from '@starships/errors';

export type AvatarGenerationResult = {
  /** data URL from OpenRouter: data:image/png;base64,... */
  dataUrl: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional text caption returned by model */
  text?: string;
  /** Model used */
  model: string;
};

export type AvatarGenerationMode = '2d' | '3d';

export type GenerateAvatarOptions = {
  subjectName: string;
  subjectDescription?: string;
  subjectAvatarPrompt?: string;
  styleHint?: string;
  starshipId: string;
  runtimeEnv?: Record<string, unknown>;
  avatarMode?: AvatarGenerationMode;
  engineConfigFromHost?: Record<string, unknown>;
};

const DISABLED = 'Avatar generation is temporarily disabled (DAG engine removed); reimplement as a direct OpenRouter image call.';

export class AvatarGenerationService {
  async generateMirrorDescription(_options: {
    agentName: string;
    agentRole?: string;
    agentSystemPrompt?: string;
    agentModel: string;
    /** Inert legacy DAG blueprint (always undefined now; the column was dropped). */
    agentBlueprint?: Blueprint;
    agentTools?: unknown[];
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
    engineConfigFromHost?: Record<string, unknown>;
  }): Promise<{ description: string; model: string }> {
    throw new AppError(DISABLED, 'NOT_IMPLEMENTED', 501);
  }

  async generateAvatar(_options: GenerateAvatarOptions): Promise<AvatarGenerationResult> {
    throw new AppError(DISABLED, 'NOT_IMPLEMENTED', 501);
  }

  async generateAvatar3DFromReference(_options: {
    subjectName: string;
    subjectDescription?: string;
    starshipId: string;
    referenceImageUrl: string;
    runtimeEnv?: Record<string, unknown>;
    engineConfigFromHost?: Record<string, unknown>;
  }): Promise<AvatarGenerationResult> {
    throw new AppError(DISABLED, 'NOT_IMPLEMENTED', 501);
  }
}
