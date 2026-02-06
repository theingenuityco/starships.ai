/**
 * AgentTemplateMarketingService
 *
 * Instance-admin-only tooling to generate marketing content for a *published agent template*.
 * This powers the public `/marketplace/agents/[slug]` marketing pages.
 */
import { ForbiddenError, NotFoundError } from '@starships/errors';
import { AgentRepository, AgentTemplateRepository, MarketingContentRepository, ToolTemplateRepository } from '@starships/models';
import type { AgentModel, AgentTemplateModel, UserModel } from '@starships/protocol';
import { UserRepository } from '@starships/models';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { getEnvConfig } from '@starships/env';
import { buildAutopilotExecutionBundle } from './autopilot-execution-bundle';
import { AttachmentService } from './AttachmentService';
import { AvatarGenerationService } from './AvatarGenerationService';
import { ProfileImageGenerationService } from './ProfileImageGenerationService';
import { MarketingContentGenerationService } from './MarketingContentGenerationService';
import { triggerNextRevalidate } from '@/utils/nextRevalidate';

export class AgentTemplateMarketingService {
  private userRepository: UserRepository;
  private agentRepository: AgentRepository;
  private agentTemplateRepository: AgentTemplateRepository;
  private toolTemplateRepository: ToolTemplateRepository;
  private attachmentService: AttachmentService;
  private avatarGenerationService: AvatarGenerationService;
  private profileImageGenerationService: ProfileImageGenerationService;
  private marketingContentGenerationService: MarketingContentGenerationService;
  private marketingContentRepository: MarketingContentRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.agentRepository = new AgentRepository();
    this.agentTemplateRepository = new AgentTemplateRepository();
    this.toolTemplateRepository = new ToolTemplateRepository();
    this.attachmentService = new AttachmentService();
    this.avatarGenerationService = new AvatarGenerationService();
    this.profileImageGenerationService = new ProfileImageGenerationService();
    this.marketingContentGenerationService = new MarketingContentGenerationService();
    this.marketingContentRepository = new MarketingContentRepository();
  }

  async generateTemplateMarketingContent(
    templateId: string,
    adminUserId: string,
    options?: {
      onStep?: (key:
        | 'load_template'
        | 'resolve_parent_agent'
        | 'build_runner_bundle'
        | 'generate_avatar'
        | 'generate_problem_statements'
        | 'generate_profile_images'
        | 'persist_template_assets'
        | 'revalidate', status: 'running' | 'completed' | 'failed') => void;
    }
  ): Promise<{
    templateId: string;
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
      throw new ForbiddenError('Only instance admins can generate template marketing content');
    }

    options?.onStep?.('load_template', 'running');
    const template = await this.agentTemplateRepository.findInternalById(templateId);
    if (!template) throw new NotFoundError('AgentTemplate', templateId);
    options?.onStep?.('load_template', 'completed');

    // We still need a starship context for remote runner + attachment storage.
    options?.onStep?.('resolve_parent_agent', 'running');
    const parentAgent = await this.agentRepository.findParentAgentByPublishedTemplateId(templateId);
    if (!parentAgent) {
      throw new NotFoundError('Agent', `parent of template ${templateId}`);
    }
    options?.onStep?.('resolve_parent_agent', 'completed');

    const env = getEnvConfig();
    const runtimeEnv: Record<string, unknown> = {
      STARSHIP_ID: parentAgent.starshipId,
      // No "real" agent id for templates; keep this value informative for runner logs.
      AGENT_ID: parentAgent.id,
      SERVER_URL: env.SERVER_URL,
    };

    options?.onStep?.('build_runner_bundle', 'running');
    const executionBundle = await buildAutopilotExecutionBundle({
      starshipId: parentAgent.starshipId,
      authUserId: adminUserId,
      runtimeEnv,
    });
    options?.onStep?.('build_runner_bundle', 'completed');

    // Build an agent model used only for generation:
    // - starshipId comes from parent agent
    // - fields come from template so the marketing reflects the public page
    // - no slug to force text-only profile images (avoid reference-image tool dependency)
    const agentForGeneration: AgentModel = {
      ...(parentAgent as AgentModel),
      id: parentAgent.id,
      slug: '', // force text-only path in ProfileImageGenerationService
      name: template.name,
      role: template.role,
      description: template.description,
      category: template.category,
      model: template.model,
      blueprint: template.blueprint,
      systemPrompt: template.systemPrompt,
      state: template.state,
      previewPrompts: template.previewPrompts,
      assignedToolSlugs: template.assignedToolSlugs,
    };

    // ---------------------------------------------------------------------
    // 1) Generate avatarPrompt (mirror) + avatar image
    // ---------------------------------------------------------------------
    options?.onStep?.('generate_avatar', 'running');
    const mirrorResult = await this.avatarGenerationService.generateMirrorDescription({
      agentName: agentForGeneration.name,
      agentDescription: agentForGeneration.description,
      agentModel: agentForGeneration.model,
      agentBlueprint: agentForGeneration.blueprint!,
      agentTools: [], // mirror should not tool-call; keep empty
      starshipId: agentForGeneration.starshipId,
      runtimeEnv,
      engineConfigFromHost: executionBundle.engineConfig,
    });
    agentForGeneration.avatarPrompt = mirrorResult.description;

    const avatarResult = await this.avatarGenerationService.generateAvatar({
      subjectName: agentForGeneration.name,
      subjectDescription: agentForGeneration.description,
      subjectAvatarPrompt: mirrorResult.description,
      starshipId: agentForGeneration.starshipId,
      runtimeEnv,
      engineConfigFromHost: executionBundle.engineConfig,
    });
    const avatarAttachment = await this.attachmentService.createAttachment({
      starshipId: agentForGeneration.starshipId,
      conversationId: `public-agent-template-${templateId}-avatar`,
      filename: `agent-template-${templateId}-avatar.webp`,
      buffer: avatarResult.buffer,
      mimeType: avatarResult.mimeType,
    });
    agentForGeneration.avatarAttachmentId = avatarAttachment.id;
    options?.onStep?.('generate_avatar', 'completed');

    // ---------------------------------------------------------------------
    // 2) Generate problem statements text (marketing_content row for template)
    // ---------------------------------------------------------------------
    options?.onStep?.('generate_problem_statements', 'running');
    const assignedToolSlugs = Array.isArray(template.assignedToolSlugs) ? template.assignedToolSlugs : [];
    const toolInfos: Array<{ name?: string; slug?: string; description?: string }> = [];
    for (const slug of assignedToolSlugs) {
      try {
        const toolTemplate = await this.toolTemplateRepository.findBySlug(slug);
        if (toolTemplate) {
          toolInfos.push({ name: toolTemplate.name, slug: toolTemplate.slug, description: toolTemplate.description });
        } else {
          toolInfos.push({ slug });
        }
      } catch {
        toolInfos.push({ slug });
      }
    }

    const statementsResult = await this.marketingContentGenerationService.generateProblemStatements({
      agentName: template.name,
      agentRole: template.role,
      agentDescription: template.description,
      agentCategory: template.category,
      agentTools: toolInfos,
      agentModel: template.model,
      agentBlueprint: template.blueprint!,
      starshipId: parentAgent.starshipId,
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
    options?.onStep?.('generate_problem_statements', 'completed');

    // ---------------------------------------------------------------------
    // 3) Generate profile images (text-only) + copy attachments into template storage
    // ---------------------------------------------------------------------
    options?.onStep?.('generate_profile_images', 'running');
    // Compute core capabilities + domain context similar to PublicationService
    let coreCapabilities = '';
    if (assignedToolSlugs.length > 0) {
      coreCapabilities = assignedToolSlugs.join(', ');
    } else {
      const parts: string[] = [];
      if (template.role) parts.push(template.role);
      if (template.description) {
        const desc = template.description.length > 100 ? template.description.slice(0, 100) + '...' : template.description;
        parts.push(desc);
      }
      coreCapabilities = parts.join(' — ') || 'general assistance';
    }
    if (coreCapabilities.length > 200) coreCapabilities = coreCapabilities.slice(0, 197) + '...';
    const domainContext = template.description ? template.description.split(/[.!?]/)[0].trim().slice(0, 100) : template.role || 'general assistance';

    const genProblem = await this.profileImageGenerationService.generateProfileImage(agentForGeneration, 'problem_statements', {
      coreCapabilities,
      domainContext,
      engineConfigFromHost: executionBundle.engineConfig,
    });
    const genCaps = await this.profileImageGenerationService.generateProfileImage(agentForGeneration, 'capabilities', {
      coreCapabilities,
      domainContext,
      engineConfigFromHost: executionBundle.engineConfig,
    });
    const genTry = await this.profileImageGenerationService.generateProfileImage(agentForGeneration, 'try_these_prompts', {
      coreCapabilities,
      domainContext,
      engineConfigFromHost: executionBundle.engineConfig,
    });

    const [problemAttachment, capsAttachment, tryAttachment] = await Promise.all([
      this.attachmentService.createAttachment({
        starshipId: agentForGeneration.starshipId,
        conversationId: `public-agent-template-${templateId}-problem_statements`,
        filename: `agent-template-${templateId}-problem-statements.webp`,
        buffer: genProblem.buffer,
        mimeType: genProblem.mimeType,
      }),
      this.attachmentService.createAttachment({
        starshipId: agentForGeneration.starshipId,
        conversationId: `public-agent-template-${templateId}-capabilities`,
        filename: `agent-template-${templateId}-capabilities.webp`,
        buffer: genCaps.buffer,
        mimeType: genCaps.mimeType,
      }),
      this.attachmentService.createAttachment({
        starshipId: agentForGeneration.starshipId,
        conversationId: `public-agent-template-${templateId}-try_these_prompts`,
        filename: `agent-template-${templateId}-try-these-prompts.webp`,
        buffer: genTry.buffer,
        mimeType: genTry.mimeType,
      }),
    ]);
    options?.onStep?.('generate_profile_images', 'completed');

    // Lookup attachment S3 keys (internal)
    options?.onStep?.('persist_template_assets', 'running');
    const [avatarWithUrl, problemWithUrl, capsWithUrl, tryWithUrl] = await Promise.all([
      this.attachmentService.getAttachmentWithUrl(avatarAttachment.id, agentForGeneration.starshipId),
      this.attachmentService.getAttachmentWithUrl(problemAttachment.id, agentForGeneration.starshipId),
      this.attachmentService.getAttachmentWithUrl(capsAttachment.id, agentForGeneration.starshipId),
      this.attachmentService.getAttachmentWithUrl(tryAttachment.id, agentForGeneration.starshipId),
    ]);

    if (!avatarWithUrl?.s3Key) throw new Error('Avatar attachment missing s3Key');
    if (!problemWithUrl?.s3Key) throw new Error('Problem statements image attachment missing s3Key');
    if (!capsWithUrl?.s3Key) throw new Error('Capabilities image attachment missing s3Key');
    if (!tryWithUrl?.s3Key) throw new Error('Try-these-prompts image attachment missing s3Key');

    await this.agentTemplateRepository.updateAvatarStorage(templateId, {
      avatarS3Key: avatarWithUrl.s3Key,
      avatarMimeType: avatarWithUrl.mimeType || 'image/webp',
      avatarUpdatedAt: avatarWithUrl.createdAt || new Date().toISOString(),
    });

    await Promise.all([
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'problem_statements', {
        s3Key: problemWithUrl.s3Key,
        mimeType: problemWithUrl.mimeType || 'image/webp',
        updatedAt: problemWithUrl.createdAt || new Date().toISOString(),
      }),
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'capabilities', {
        s3Key: capsWithUrl.s3Key,
        mimeType: capsWithUrl.mimeType || 'image/webp',
        updatedAt: capsWithUrl.createdAt || new Date().toISOString(),
      }),
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'try_these_prompts', {
        s3Key: tryWithUrl.s3Key,
        mimeType: tryWithUrl.mimeType || 'image/webp',
        updatedAt: tryWithUrl.createdAt || new Date().toISOString(),
      }),
    ]);
    options?.onStep?.('persist_template_assets', 'completed');

    // Revalidate public ISR caches so the marketplace page updates quickly.
    options?.onStep?.('revalidate', 'running');
    triggerNextRevalidate({ tags: ['public-agent-templates'] });
    options?.onStep?.('revalidate', 'completed');

    // Compute cache-busting URLs based on updated storage timestamps.
    const avatarStorage = await this.agentTemplateRepository.getAvatarStorageById(templateId);
    const problemStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'problem_statements');
    const capsStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'capabilities');
    const tryStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'try_these_prompts');

    const avatarV = avatarStorage?.avatarUpdatedAt ? new Date(avatarStorage.avatarUpdatedAt).getTime() : Date.now();
    const pv = problemStorage?.updatedAt ? new Date(problemStorage.updatedAt).getTime() : Date.now();
    const cv = capsStorage?.updatedAt ? new Date(capsStorage.updatedAt).getTime() : Date.now();
    const tv = tryStorage?.updatedAt ? new Date(tryStorage.updatedAt).getTime() : Date.now();

    return {
      templateId,
      marketingContent: {
        avatarUrl: `/api/v1/agent-templates/${templateId}/avatar?v=${avatarV}`,
        problemStatementsText: statements,
        problemStatementsImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/problem-statements?v=${pv}`,
        capabilitiesImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/capabilities?v=${cv}`,
        tryThesePromptsImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/try-these-prompts?v=${tv}`,
      },
    };
  }
}

