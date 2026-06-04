/**
 * AgentMarketingService
 *
 * Generates marketing content for an agent (instance admin tooling).
 *
 * This is intentionally decoupled from the marketplace publication flow:
 * - Generation happens on-demand for admins
 * - Publication only *copies* existing assets/content to the template
 */
import { ForbiddenError, NotFoundError } from '@starships/errors';
import { AgentRepository, MarketingContentRepository, StarshipRepository, UserRepository } from '@starships/models';
import type { AgentModel, UserModel } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { buildAutopilotExecutionBundle } from './autopilot-execution-bundle';
import { AttachmentService } from './AttachmentService';
import { AvatarGenerationService } from './AvatarGenerationService';
import { MarketingContentGenerationService } from './MarketingContentGenerationService';
import { ProfileImageGenerationService } from './ProfileImageGenerationService';

export class AgentMarketingService {
  private agentRepository: AgentRepository;
  private starshipRepository: StarshipRepository;
  private userRepository: UserRepository;
  private attachmentService: AttachmentService;
  private avatarGenerationService: AvatarGenerationService;
  private profileImageGenerationService: ProfileImageGenerationService;
  private marketingContentGenerationService: MarketingContentGenerationService;
  private marketingContentRepository: MarketingContentRepository;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.starshipRepository = new StarshipRepository();
    this.userRepository = new UserRepository();
    this.attachmentService = new AttachmentService();
    this.avatarGenerationService = new AvatarGenerationService();
    this.profileImageGenerationService = new ProfileImageGenerationService();
    this.marketingContentGenerationService = new MarketingContentGenerationService();
    this.marketingContentRepository = new MarketingContentRepository();
  }

  async generateAgentMarketingContent(
    agentId: string,
    adminUserId: string
  ): Promise<{
    agent: AgentModel;
    marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    };
  }> {
    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can generate agent marketing content');
    }

    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const starship = await this.starshipRepository.findById(agent.starshipId);
    if (!starship) {
      throw new NotFoundError('Starship', agent.starshipId);
    }

    const env = getEnvConfig();
    const runtimeEnv: Record<string, unknown> = {
      STARSHIP_ID: agent.starshipId,
      AGENT_ID: agent.id,
      SERVER_URL: env.SERVER_URL,
    };

    const executionBundle = await buildAutopilotExecutionBundle({
      starshipId: agent.starshipId,
      authUserId: adminUserId,
      runtimeEnv,
    });

    // 1) Ensure avatar exists (generate if missing)
    if (!agent.avatarPrompt || !agent.avatarAttachmentId) {
      const mirrorResult = await this.avatarGenerationService.generateMirrorDescription({
        agentName: agent.name,
        agentRole: agent.role,
        agentSystemPrompt: agent.systemPrompt,
        agentModel: agent.model,
        agentBlueprint: agent.blueprint!,
        agentTools: [],
        starshipId: agent.starshipId,
        runtimeEnv,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const avatarResult = await this.avatarGenerationService.generateAvatar({
        subjectName: agent.name,
        subjectDescription: agent.description,
        subjectAvatarPrompt: mirrorResult.description,
        starshipId: agent.starshipId,
        runtimeEnv,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const avatarAttachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-avatar-${agent.id}`,
        filename: `agent-${agent.slug || agent.id}-avatar.webp`,
        buffer: avatarResult.buffer,
        mimeType: avatarResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        avatarPrompt: mirrorResult.description,
        avatarAttachmentId: avatarAttachment.id,
      });
    }

    // 2) Ensure problem statements text exists (generate if missing)
    const existingStatements = await this.marketingContentRepository.findByEntityAndType(
      'agent',
      agent.id,
      'problem_statements_text'
    );

    if (!existingStatements?.textContent) {
      const statementsResult = await this.marketingContentGenerationService.generateProblemStatements({
        agentName: agent.name,
        agentRole: agent.role,
        agentDescription: agent.description,
        agentCategory: agent.category,
        agentTools: [],
        agentModel: agent.model,
        agentBlueprint: agent.blueprint!,
        starshipId: agent.starshipId,
        runtimeEnv,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const statements = Array.isArray(statementsResult.statements)
        ? statementsResult.statements.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];

      await this.marketingContentRepository.createOrUpdate({
        entityType: 'agent',
        entityId: agent.id,
        contentType: 'problem_statements_text',
        contentFormat: 'text',
        textContent: JSON.stringify(statements),
        textFormat: 'json',
        generationMetadata: { model: statementsResult.model },
      });
    }

    // 3) Ensure profile images exist (generate if missing)
    let coreCapabilities = '';
    {
      const parts: string[] = [];
      if (agent.role) parts.push(agent.role);
      if (agent.description) {
        const desc = agent.description.length > 100 ? agent.description.slice(0, 100) + '...' : agent.description;
        parts.push(desc);
      }
      coreCapabilities = parts.join(' — ') || 'general assistance';
    }
    if (coreCapabilities.length > 200) {
      coreCapabilities = coreCapabilities.slice(0, 197) + '...';
    }
    const domainContext = agent.description ? agent.description.split(/[.!?]/)[0].trim().slice(0, 100) : agent.role || 'general assistance';

    // Re-fetch latest agent after potential avatar updates.
    const beforeImages = await this.agentRepository.findById(agentId);
    if (!beforeImages) throw new NotFoundError('Agent', agentId);

    if (!beforeImages.problemStatementsAttachmentId) {
      const imageResult = await this.profileImageGenerationService.generateProfileImage(beforeImages, 'problem_statements', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });
      const attachment = await this.attachmentService.createAttachment({
        starshipId: beforeImages.starshipId,
        conversationId: `agent-profile-${beforeImages.id}-problem_statements`,
        filename: `agent-${beforeImages.slug || beforeImages.id}-problem-statements.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });
      await this.agentRepository.update(beforeImages.id, { problemStatementsAttachmentId: attachment.id });
    }

    if (!beforeImages.capabilitiesAttachmentId) {
      const imageResult = await this.profileImageGenerationService.generateProfileImage(beforeImages, 'capabilities', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });
      const attachment = await this.attachmentService.createAttachment({
        starshipId: beforeImages.starshipId,
        conversationId: `agent-profile-${beforeImages.id}-capabilities`,
        filename: `agent-${beforeImages.slug || beforeImages.id}-capabilities.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });
      await this.agentRepository.update(beforeImages.id, { capabilitiesAttachmentId: attachment.id });
    }

    if (!beforeImages.tryThesePromptsAttachmentId) {
      const imageResult = await this.profileImageGenerationService.generateProfileImage(beforeImages, 'try_these_prompts', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });
      const attachment = await this.attachmentService.createAttachment({
        starshipId: beforeImages.starshipId,
        conversationId: `agent-profile-${beforeImages.id}-try_these_prompts`,
        filename: `agent-${beforeImages.slug || beforeImages.id}-try-these-prompts.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });
      await this.agentRepository.update(beforeImages.id, { tryThesePromptsAttachmentId: attachment.id });
    }

    // Final reload for return payload
    const finalAgent = await this.agentRepository.findById(agentId);
    if (!finalAgent) throw new NotFoundError('Agent', agentId);

    // Fetch statements for return
    let problemStatementsText: string[] | undefined;
    try {
      const rec = await this.marketingContentRepository.findByEntityAndType('agent', finalAgent.id, 'problem_statements_text');
      const parsed = rec?.textContent ? JSON.parse(rec.textContent) : [];
      if (Array.isArray(parsed)) {
        problemStatementsText = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      }
    } catch {
      // ignore
    }

    // Build preview URLs for attachments
    const ids: Array<{ key: 'avatar' | 'problem' | 'cap' | 'try'; id?: string }> = [
      { key: 'avatar', id: finalAgent.avatarAttachmentId },
      { key: 'problem', id: finalAgent.problemStatementsAttachmentId },
      { key: 'cap', id: finalAgent.capabilitiesAttachmentId },
      { key: 'try', id: finalAgent.tryThesePromptsAttachmentId },
    ];
    const requestedIds = ids.map((x) => x.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    const attachments = await this.attachmentService.getAttachmentsBatch(requestedIds, finalAgent.starshipId);
    const urlById = new Map<string, string>();
    for (const a of attachments) {
      if (a?.id && typeof (a as { previewUrl?: unknown }).previewUrl === 'string') {
        urlById.set(a.id, (a as { previewUrl: string }).previewUrl);
      }
    }

    return {
      agent: finalAgent,
      marketingContent: {
        avatarUrl: finalAgent.avatarAttachmentId ? urlById.get(finalAgent.avatarAttachmentId) : undefined,
        problemStatementsText,
        problemStatementsImageUrl: finalAgent.problemStatementsAttachmentId ? urlById.get(finalAgent.problemStatementsAttachmentId) : undefined,
        capabilitiesImageUrl: finalAgent.capabilitiesAttachmentId ? urlById.get(finalAgent.capabilitiesAttachmentId) : undefined,
        tryThesePromptsImageUrl: finalAgent.tryThesePromptsAttachmentId ? urlById.get(finalAgent.tryThesePromptsAttachmentId) : undefined,
      },
    };
  }
}

