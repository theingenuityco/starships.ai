/**
 * Publication Service
 *
 * Handles agent publication workflow: request, prepare, approve, reject, confirm.
 * Orchestrates template creation, tool synchronization, and marketing content generation.
 */

import { ForbiddenError, NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  AgentTemplateRepository,
  StarshipRepository,
  UserRepository,
  ToolRepository,
  ToolTemplateRepository,
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_AGENT_TEMPERATURE,
  MAX_AGENT_MAX_TOKENS,
  MAX_AGENT_TIMEOUT_MS,
  MIN_AGENT_MAX_TOKENS,
  MIN_AGENT_TIMEOUT_MS,
  MarketingContentRepository,
} from '@starships/models';
import type { AgentModel, UserModel, ToolModel } from '@starships/protocol';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { AttachmentService } from './AttachmentService';
import { AvatarGenerationService } from './AvatarGenerationService';
import { ProfileImageGenerationService } from './ProfileImageGenerationService';
import { MarketingContentGenerationService } from './MarketingContentGenerationService';
import { ProfileImageService } from './ProfileImageService';
import { buildAutopilotExecutionBundle } from './autopilot-execution-bundle';
import { getEnvConfig } from '@starships/env';

export class PublicationService {
  private agentRepository: AgentRepository;
  private starshipRepository: StarshipRepository;
  private userRepository: UserRepository;
  private attachmentService: AttachmentService;
  private avatarGenerationService: AvatarGenerationService;
  private profileImageGenerationService: ProfileImageGenerationService;
  private marketingContentGenerationService: MarketingContentGenerationService;
  private profileImageService: ProfileImageService;
  private marketingContentRepository: MarketingContentRepository;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.starshipRepository = new StarshipRepository();
    this.userRepository = new UserRepository();
    this.attachmentService = new AttachmentService();
    this.avatarGenerationService = new AvatarGenerationService();
    this.profileImageGenerationService = new ProfileImageGenerationService();
    this.marketingContentGenerationService = new MarketingContentGenerationService();
    this.profileImageService = new ProfileImageService();
    this.marketingContentRepository = new MarketingContentRepository();
  }

  /**
   * Guard: agents deployed from marketplace templates are immutable.
   */
  private assertAgentIsEditable(agent: AgentModel, action: string): void {
    if (typeof agent.sourceTemplateId === 'string' && agent.sourceTemplateId.trim().length > 0) {
      throw new ValidationError(
        `Cannot ${action} agent "${agent.name}" because it was deployed from the marketplace. Create a copy to customize it.`
      );
    }
  }

  /**
   * Calculate next version based on current version and bump type
   */
  private calculateNextVersion(currentVersion: string, versionBump: 'patch' | 'minor' | 'major'): string {
    const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return '1.0.0';

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);

    switch (versionBump) {
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'major':
        return `${major + 1}.0.0`;
      default:
        return '1.0.0';
    }
  }

  /**
   * Sanitize numeric fields for template creation
   */
  private sanitizeNumericFields(agent: AgentModel): {
    temperature: number;
    maxTokens?: number;
    timeout: number;
  } {
    return {
      temperature:
        typeof agent.temperature === 'number' && !Number.isNaN(agent.temperature) ? agent.temperature : DEFAULT_AGENT_TEMPERATURE,
      maxTokens:
        typeof agent.maxTokens === 'number' && !Number.isNaN(agent.maxTokens)
          ? Math.min(MAX_AGENT_MAX_TOKENS, Math.max(MIN_AGENT_MAX_TOKENS, agent.maxTokens))
          : undefined,
      timeout:
        typeof agent.timeout === 'number' && !Number.isNaN(agent.timeout)
          ? Math.min(MAX_AGENT_TIMEOUT_MS, Math.max(MIN_AGENT_TIMEOUT_MS, agent.timeout))
          : DEFAULT_AGENT_TIMEOUT_MS,
    };
  }

  /**
   * Ensure template exists and is up-to-date
   */
  private async ensureTemplate(agent: AgentModel, nextVersion: string): Promise<{ templateId: string; created: boolean }> {
    const templateRepo = new AgentTemplateRepository();
    const { temperature, maxTokens, timeout } = this.sanitizeNumericFields(agent);

    let targetTemplateId = agent.publishedTemplateId;

    if (targetTemplateId) {
      const existingTemplate = await templateRepo.findById(targetTemplateId);
      if (!existingTemplate) {
        targetTemplateId = undefined;
      }
    }

    if (!targetTemplateId) {
      const createdTemplate = await templateRepo.create({
        name: agent.name,
        description: agent.description,
        role: agent.role || 'Assistant',
        category: agent.category ?? 'general',
        model: agent.model,
        temperature,
        maxTokens,
        reasoning: agent.reasoning,
        timeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state!,
        blueprint: agent.blueprint!,
        icon: undefined,
        previewPrompts: agent.previewPrompts,
        assignedToolSlugs: [],
      });
      await templateRepo.update(createdTemplate.id, { version: nextVersion });
      return { templateId: createdTemplate.id, created: true };
    } else {
      await templateRepo.update(targetTemplateId, {
        name: agent.name,
        description: agent.description,
        role: agent.role || 'Assistant',
        category: agent.category ?? 'general',
        model: agent.model,
        temperature,
        maxTokens,
        reasoning: agent.reasoning,
        timeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state,
        blueprint: agent.blueprint,
        previewPrompts: agent.previewPrompts,
        version: nextVersion,
      });
      return { templateId: targetTemplateId, created: false };
    }
  }

  /**
   * Sync tools from agent to template
   */
  private async syncToolsToTemplate(agent: AgentModel, agentTemplateId: string, adminUserId: string): Promise<void> {
    try {
      const toolRepo = new ToolRepository();
      const toolTemplateRepo = new ToolTemplateRepository();
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);
      const relationshipItems: Array<{ toolTemplateId: string; defaultPermission: 'allow' | 'ask' | 'deny' }> = [];

      for (const tool of agentTools as ToolModel[]) {
        const hasParams = !!tool.parameters && tool.parameters.type === 'object';
        const hasBlueprint = !!(
          tool.blueprint &&
          typeof (tool.blueprint as { nodes?: unknown }).nodes !== 'undefined' &&
          Array.isArray((tool.blueprint as { nodes?: unknown[] }).nodes)
        );

        if (tool.status === 'draft' || !hasParams || !hasBlueprint) continue;

        let toolTemplateId = tool.publishedTemplateId;
        const nextToolVersion = tool.publicationRequestedVersion || tool.version || '1.0.0';

        if (toolTemplateId) {
          const existingTemplate = await toolTemplateRepo.findById(toolTemplateId);
          if (existingTemplate) {
            await toolTemplateRepo.update(toolTemplateId, {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              blueprint: tool.blueprint,
              transforms: tool.transforms,
              mutations: tool.mutations,
              condition: tool.condition,
              version: nextToolVersion,
            });
          } else {
            toolTemplateId = undefined;
          }
        }

        if (!toolTemplateId) {
          const createdTemplate = await toolTemplateRepo.create({
            name: tool.name,
            description: tool.description,
            category: 'utility',
            parameters: tool.parameters!,
            blueprint: tool.blueprint!,
            transforms: tool.transforms,
            mutations: tool.mutations,
            condition: tool.condition,
            version: nextToolVersion,
          });
          toolTemplateId = createdTemplate.id;
        }

        await toolRepo.update(tool.id, {
          version: nextToolVersion,
          publishedTemplateId: toolTemplateId,
          publicationStatus: 'published',
          publicationApprovedBy: adminUserId,
          publicationApprovedAt: new Date().toISOString(),
        });

        if (toolTemplateId && !relationshipItems.some((item) => item.toolTemplateId === toolTemplateId)) {
          const permission = (await this.agentRepository.getAgentToolPermissionBySlug(agent.id, agent.starshipId, tool.slug)) ?? 'ask';
          relationshipItems.push({ toolTemplateId, defaultPermission: permission });
        }
      }

      const templateRepo = new AgentTemplateRepository();
      await templateRepo.setToolTemplateRelationshipsWithDefaults(agentTemplateId, relationshipItems);
    } catch (err) {
      console.error('[PUBLICATION] Failed to synchronize tools:', err);
      // Non-fatal - don't throw
    }
  }

  /**
   * Copy avatar from agent to template
   */
  private async copyAvatarToTemplate(agent: AgentModel, templateId: string): Promise<string | undefined> {
    if (!agent.avatarAttachmentId) {
      return undefined;
    }

    try {
      const templateRepo = new AgentTemplateRepository();
      const existingAvatar = await templateRepo.getAvatarStorageById(templateId);
      const existingAttachment = await this.attachmentService.getAttachmentWithUrl(agent.avatarAttachmentId, agent.starshipId);

      const toMs = (s?: string) => {
        if (!s) return NaN;
        const t = new Date(s).getTime();
        return Number.isFinite(t) ? t : NaN;
      };

      const templateAvatarMs = toMs(existingAvatar?.avatarUpdatedAt);
      const attachmentCreatedMs = toMs(existingAttachment?.createdAt);
      const shouldUpdateAvatar =
        !existingAvatar?.avatarS3Key ||
        (Number.isFinite(templateAvatarMs) && Number.isFinite(attachmentCreatedMs) && attachmentCreatedMs > templateAvatarMs) ||
        (!Number.isFinite(templateAvatarMs) && Number.isFinite(attachmentCreatedMs));

      if (shouldUpdateAvatar && existingAttachment?.s3Key) {
        await templateRepo.updateAvatarStorage(templateId, {
          avatarS3Key: existingAttachment.s3Key,
          avatarMimeType: existingAttachment.mimeType || 'image/png',
          avatarUpdatedAt: existingAttachment.createdAt || new Date().toISOString(),
        });
        return `/api/v1/agent-templates/${templateId}/avatar`;
      }

      return existingAvatar?.avatarS3Key ? `/api/v1/agent-templates/${templateId}/avatar` : undefined;
    } catch (err) {
      console.error('[PUBLICATION] Failed to copy avatar:', err);
      return undefined;
    }
  }

  /**
   * Request publication for an agent
   */
  async requestPublication(
    agentId: string,
    userId: string,
    options: {
      versionBump: 'patch' | 'minor' | 'major';
      changelog: string;
      toolOverrides?: { toolId: string; versionBump: 'patch' | 'minor' | 'major'; changelog: string }[];
    }
  ): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    this.assertAgentIsEditable(agent, 'publish');

    const user = (await this.userRepository.findById(userId)) as UserModel | null;
    const isAdmin = isInstanceAdmin(user);

    if (!isAdmin) {
      const starship = await this.starshipRepository.findById(agent.starshipId);
      if (!starship || starship.ownerId !== userId) {
        throw new ForbiddenError('You do not have permission to request publication for this agent');
      }
    }

    if (agent.publicationStatus === 'pending_approval') {
      throw new ValidationError('Agent is already pending approval');
    }

    if (agent.publicationStatus === 'published') {
      if (!agent.publishedTemplateId) {
        throw new ValidationError('Agent is already published');
      }
      const templateRepo = new AgentTemplateRepository();
      const template = await templateRepo.findById(agent.publishedTemplateId);
      if (!template) {
        throw new NotFoundError('AgentTemplate', agent.publishedTemplateId);
      }
    }

    // Handle tool overrides
    const toolOverrides = options.toolOverrides || [];
    if (toolOverrides.length > 0) {
      const toolRepo = new ToolRepository();
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);
      const agentToolIds = new Set(agentTools.map((t) => t.id));

      for (const override of toolOverrides) {
        try {
          const tool = await toolRepo.findById(override.toolId);
          if (!tool) continue;
          if (tool.starshipId !== agent.starshipId || !agentToolIds.has(tool.id)) continue;

          const currentToolVersion = tool.version || '1.0.0';
          const requestedToolVersion = this.calculateNextVersion(currentToolVersion, override.versionBump);

          if (tool.publicationStatus === 'pending_approval') {
            await toolRepo.update(tool.id, {
              publicationRequestedBy: userId,
              publicationVersionBump: override.versionBump,
              publicationRequestedVersion: requestedToolVersion,
              publicationChangelog: override.changelog,
            });
          } else {
            await toolRepo.requestPublicationAtomic(tool.id, {
              publicationStatus: 'pending_approval',
              publicationRequestedBy: userId,
              publicationVersionBump: override.versionBump,
              publicationRequestedVersion: requestedToolVersion,
              publicationChangelog: override.changelog,
            });
          }
        } catch (err) {
          console.error('[PUBLICATION] Failed to record tool override:', err);
        }
      }
    }

    const currentVersion = agent.version || '1.0.0';
    const requestedVersion = this.calculateNextVersion(currentVersion, options.versionBump);

    return await this.agentRepository.requestPublicationAtomic(agentId, {
      publicationStatus: 'pending_approval',
      publicationRequestedBy: userId,
      publicationVersionBump: options.versionBump,
      publicationRequestedVersion: requestedVersion,
      publicationChangelog: options.changelog,
    });
  }

  /**
   * Prepare publication: Generate missing marketing content and return preview
   */
  async preparePublication(
    agentId: string,
    adminUserId: string
  ): Promise<{
    agent: AgentModel;
    templateId: string;
    marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    };
  }> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can prepare agent publication');
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    const currentVersion = agent.version || '1.0.0';
    let nextVersion = agent.publicationRequestedVersion;
    if (!nextVersion) {
      const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
      nextVersion = match != null ? `${match[1]}.${Number(match[2]) + 1}.0` : '1.0.0';
    }

    // Ensure template exists
    const { templateId, created } = await this.ensureTemplate(agent, nextVersion);
    if (created) {
      await this.agentRepository.update(agentId, {
        publishedTemplateId: templateId,
      });
    }

    // Sync tools
    await this.syncToolsToTemplate(agent, templateId, adminUserId);

    // Build execution bundle for LLM calls
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

    const marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    } = {};

    // 1. Ensure avatar exists (auto-generate if missing)
    if (!agent.avatarPrompt || !agent.avatarAttachmentId) {
      console.log('[PUBLICATION] Auto-generating avatar...');
      const mirrorResult = await this.avatarGenerationService.generateMirrorDescription({
        agentName: agent.name,
        agentDescription: agent.description,
        agentModel: agent.model,
        agentBlueprint: agent.blueprint!,
        agentTools: await this.agentRepository.getAgentTools(agent.id, agent.starshipId),
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

      const updatedAgent = await this.agentRepository.findById(agentId);
      if (updatedAgent) {
        Object.assign(agent, updatedAgent);
      }
    }

    // Copy avatar to template
    marketingContent.avatarUrl = await this.copyAvatarToTemplate(agent, templateId);

    // 2. Generate problem statements text (only if missing)
    const existingProblemStatements = await this.marketingContentRepository.findByEntityAndType(
      'agent_template',
      templateId,
      'problem_statements_text'
    );

    if (!existingProblemStatements || !existingProblemStatements.textContent) {
      console.log('[PUBLICATION] Generating problem statements text...');
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

      const statementsResult = await this.marketingContentGenerationService.generateProblemStatements({
        agentName: agent.name,
        agentRole: agent.role,
        agentDescription: agent.description,
        agentCategory: agent.category,
        agentTools: agentTools.map((t) => ({ name: t.name, slug: t.slug, description: t.description })),
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
        entityType: 'agent_template',
        entityId: templateId,
        contentType: 'problem_statements_text',
        contentFormat: 'text',
        textContent: JSON.stringify(statements),
        textFormat: 'json',
        generationMetadata: { model: statementsResult.model },
      });

      marketingContent.problemStatementsText = statements;
    } else {
      try {
        const parsed = JSON.parse(existingProblemStatements.textContent || '[]');
        if (Array.isArray(parsed)) {
          marketingContent.problemStatementsText = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
      } catch (err) {
        console.warn('[PUBLICATION] Failed to parse existing problem statements:', err);
      }
    }

    // 3. Generate profile images (only if missing)
    const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

    let coreCapabilities = '';
    if (agentTools.length > 0) {
      coreCapabilities = agentTools.map((t) => t.name || t.slug).join(', ');
    } else {
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

    // Generate missing profile images
    if (!agent.problemStatementsAttachmentId) {
      console.log('[PUBLICATION] Generating problem statements image...');
      const imageResult = await this.profileImageGenerationService.generateProfileImage(agent, 'problem_statements', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const attachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-profile-${agent.id}-problem_statements`,
        filename: `agent-${agent.slug || agent.id}-problem-statements.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        problemStatementsAttachmentId: attachment.id,
      });
    }

    if (!agent.capabilitiesAttachmentId) {
      console.log('[PUBLICATION] Generating capabilities image...');
      const imageResult = await this.profileImageGenerationService.generateProfileImage(agent, 'capabilities', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const attachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-profile-${agent.id}-capabilities`,
        filename: `agent-${agent.slug || agent.id}-capabilities.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        capabilitiesAttachmentId: attachment.id,
      });
    }

    if (!agent.tryThesePromptsAttachmentId) {
      console.log('[PUBLICATION] Generating try these prompts image...');
      const imageResult = await this.profileImageGenerationService.generateProfileImage(agent, 'try_these_prompts', {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const attachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-profile-${agent.id}-try_these_prompts`,
        filename: `agent-${agent.slug || agent.id}-try-these-prompts.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        tryThesePromptsAttachmentId: attachment.id,
      });
    }

    // Reload agent to get updated attachment IDs
    const finalAgent = await this.agentRepository.findById(agentId);
    if (!finalAgent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Copy all profile images to template
    const profileImages = await this.profileImageService.copyAllProfileImagesToTemplate(finalAgent, templateId);
    Object.assign(marketingContent, profileImages);

    return {
      agent: finalAgent,
      templateId,
      marketingContent,
    };
  }

  /**
   * Regenerate specific marketing content item
   */
  async regenerateMarketingContent(
    agentId: string,
    templateId: string,
    type: 'avatar' | 'problem_statements_text' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image',
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
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can regenerate marketing content');
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

    const marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    } = {};

    if (type === 'avatar') {
      let avatarPrompt = agent.avatarPrompt;
      if (!avatarPrompt) {
        const mirrorResult = await this.avatarGenerationService.generateMirrorDescription({
          agentName: agent.name,
          agentDescription: agent.description,
          agentModel: agent.model,
          agentBlueprint: agent.blueprint!,
          agentTools: await this.agentRepository.getAgentTools(agent.id, agent.starshipId),
          starshipId: agent.starshipId,
          runtimeEnv,
          engineConfigFromHost: executionBundle.engineConfig,
        });
        avatarPrompt = mirrorResult.description;
        await this.agentRepository.update(agent.id, { avatarPrompt });
      }

      const avatarResult = await this.avatarGenerationService.generateAvatar({
        subjectName: agent.name,
        subjectDescription: agent.description,
        subjectAvatarPrompt: avatarPrompt,
        starshipId: agent.starshipId,
        runtimeEnv,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const attachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-avatar-${agent.id}`,
        filename: `agent-${agent.slug || agent.id}-avatar.webp`,
        buffer: avatarResult.buffer,
        mimeType: avatarResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        avatarAttachmentId: attachment.id,
      });

      marketingContent.avatarUrl = await this.copyAvatarToTemplate(agent, templateId);
    } else if (type === 'problem_statements_text') {
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

      const statementsResult = await this.marketingContentGenerationService.generateProblemStatements({
        agentName: agent.name,
        agentRole: agent.role,
        agentDescription: agent.description,
        agentCategory: agent.category,
        agentTools: agentTools.map((t) => ({ name: t.name, slug: t.slug, description: t.description })),
        agentModel: agent.model,
        agentBlueprint: agent.blueprint!,
        starshipId: agent.starshipId,
        runtimeEnv,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      await this.marketingContentRepository.createOrUpdate({
        entityType: 'agent_template',
        entityId: templateId,
        contentType: 'problem_statements_text',
        contentFormat: 'text',
        textContent: JSON.stringify(statementsResult.statements),
        textFormat: 'json',
        generationMetadata: { model: statementsResult.model },
      });

      const statements = Array.isArray(statementsResult.statements)
        ? statementsResult.statements.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
      marketingContent.problemStatementsText = statements;
    } else {
      // Profile images
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

      let coreCapabilities = '';
      if (agentTools.length > 0) {
        coreCapabilities = agentTools.map((t) => t.name || t.slug).join(', ');
      } else {
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

      const domainContext = agent.description
        ? agent.description.split(/[.!?]/)[0].trim().slice(0, 100)
        : agent.role || 'general assistance';

      let imageType: 'problem_statements' | 'capabilities' | 'try_these_prompts';
      let attachmentField: keyof AgentModel;
      let conversationIdSuffix: string;
      let filenameSuffix: string;

      if (type === 'problem_statements_image') {
        imageType = 'problem_statements';
        attachmentField = 'problemStatementsAttachmentId';
        conversationIdSuffix = 'problem_statements';
        filenameSuffix = 'problem-statements';
      } else if (type === 'capabilities_image') {
        imageType = 'capabilities';
        attachmentField = 'capabilitiesAttachmentId';
        conversationIdSuffix = 'capabilities';
        filenameSuffix = 'capabilities';
      } else {
        imageType = 'try_these_prompts';
        attachmentField = 'tryThesePromptsAttachmentId';
        conversationIdSuffix = 'try_these_prompts';
        filenameSuffix = 'try-these-prompts';
      }

      const imageResult = await this.profileImageGenerationService.generateProfileImage(agent, imageType, {
        coreCapabilities,
        domainContext,
        engineConfigFromHost: executionBundle.engineConfig,
      });

      const attachment = await this.attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-profile-${agent.id}-${conversationIdSuffix}`,
        filename: `agent-${agent.slug || agent.id}-${filenameSuffix}.webp`,
        buffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      });

      await this.agentRepository.update(agent.id, {
        [attachmentField]: attachment.id,
      });

      const result = await this.profileImageService.copyProfileImageToTemplate(agent, templateId, imageType);
      if (result.url) {
        if (imageType === 'problem_statements') {
          marketingContent.problemStatementsImageUrl = result.url;
        } else if (imageType === 'capabilities') {
          marketingContent.capabilitiesImageUrl = result.url;
        } else {
          marketingContent.tryThesePromptsImageUrl = result.url;
        }
      }
    }

    if (agent.publishedTemplateId !== templateId) {
      await this.agentRepository.update(agentId, {
        publishedTemplateId: templateId,
      });
    }

    const finalAgent = await this.agentRepository.findById(agentId);
    if (!finalAgent) {
      throw new NotFoundError('Agent', agentId);
    }

    return {
      agent: finalAgent,
      marketingContent,
    };
  }

  /**
   * Approve publication for an agent
   */
  async approvePublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can approve agent publication');
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    const currentVersion = agent.version || '1.0.0';
    let nextVersion = agent.publicationRequestedVersion;
    if (!nextVersion) {
      const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
      nextVersion = match != null ? `${match[1]}.${Number(match[2]) + 1}.0` : '1.0.0';
    }

    // Ensure template exists
    const { templateId } = await this.ensureTemplate(agent, nextVersion);

    // Sync tools
    await this.syncToolsToTemplate(agent, templateId, adminUserId);

    // Copy avatar
    await this.copyAvatarToTemplate(agent, templateId);

    // Copy profile images
    await this.profileImageService.ensureTemplateProfileImages(agent, templateId);

    // Mark agent as published
    const updated = await this.agentRepository.update(agentId, {
      version: nextVersion,
      publicationStatus: 'published',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
      publishedTemplateId: templateId,
    });

    if (!updated) {
      throw new NotFoundError('Agent', agentId);
    }

    return updated;
  }

  /**
   * Reject publication for an agent
   */
  async rejectPublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can reject agent publication');
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    const updated = await this.agentRepository.update(agentId, {
      publicationStatus: 'rejected',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
    });

    if (!updated) {
      throw new NotFoundError('Agent', agentId);
    }

    return updated;
  }

  /**
   * Confirm publication: Mark agent as published (template already exists with content)
   */
  async confirmPublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can confirm agent publication');
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    const currentVersion = agent.version || '1.0.0';
    let nextVersion = agent.publicationRequestedVersion;
    if (!nextVersion) {
      const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
      nextVersion = match != null ? `${match[1]}.${Number(match[2]) + 1}.0` : '1.0.0';
    }

    const targetTemplateId = agent.publishedTemplateId;
    if (!targetTemplateId) {
      throw new ValidationError('Template not found. Please prepare publication first.');
    }

    const templateRepo = new AgentTemplateRepository();
    const template = await templateRepo.findById(targetTemplateId);
    if (!template) {
      throw new NotFoundError('AgentTemplate', targetTemplateId);
    }

    const updated = await this.agentRepository.update(agentId, {
      version: nextVersion,
      publicationStatus: 'published',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
      publishedTemplateId: targetTemplateId,
    });

    if (!updated) {
      throw new NotFoundError('Agent', agentId);
    }

    return updated;
  }

  /**
   * Update problem statements for a template
   */
  async updateProblemStatements(
    templateId: string,
    statements: string[],
    adminUserId: string
  ): Promise<{
    problemStatementsText: string[];
  }> {
    const adminUser = (await this.userRepository.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can update problem statements');
    }

    await this.marketingContentRepository.createOrUpdate({
      entityType: 'agent_template',
      entityId: templateId,
      contentType: 'problem_statements_text',
      contentFormat: 'text',
      textContent: JSON.stringify(statements),
      textFormat: 'json',
    });

    return {
      problemStatementsText: statements,
    };
  }
}
