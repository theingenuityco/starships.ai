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
  getConnection,
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
import { buildAgentTemplatePublicAvatarS3Key, buildPublicS3ObjectUrl, copyObjectInS3, deleteFromS3 } from '@/utils/s3-helper';

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
   * Unpublish an agent: remove its marketplace template and revert to draft.
   *
   * IMPORTANT:
   * - This is intended for agents that are currently `publicationStatus === 'published'`.
   * - This deletes the associated `agent_templates` row referenced by `publishedTemplateId`.
   *   Deployed agents created from that template will have their `sourceTemplateId` set NULL
   *   by FK ON DELETE behavior.
   */
  async unpublishAgent(agentId: string): Promise<AgentModel> {
    const id = String(agentId || '').trim();
    if (!id) throw new ValidationError('Agent id is required');

    const agent = await this.agentRepository.findById(id);
    if (!agent) throw new NotFoundError('Agent', id);

    if (agent.publicationStatus !== 'published') {
      throw new ValidationError('Only published agents can be unpublished');
    }

    const templateId = typeof agent.publishedTemplateId === 'string' ? agent.publishedTemplateId.trim() : '';

    // No published template pointer: still revert the agent metadata to draft.
    if (!templateId) {
      const updated = await this.agentRepository.update(id, {
        publicationStatus: 'draft',
        publicationRequestedBy: undefined,
        publicationApprovedBy: undefined,
        publicationApprovedAt: undefined,
        publicationVersionBump: undefined,
        publicationRequestedVersion: undefined,
        publicationChangelog: undefined,
        publishedTemplateId: undefined,
      });
      if (!updated) throw new NotFoundError('Agent', id);
      return updated;
    }

    // Guard: do not allow unpublish if this template is currently deployed anywhere.
    // ("Deployed from marketplace" agents reference the template via `source_template_id`.)
    // Exclude the agent being unpublished (defensive).
    const preConn = getConnection();
    const deployedCountRow = await preConn.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM agents
       WHERE source_template_id = $1
         AND id <> $2`,
      [templateId, id]
    );
    const deployedCount = Number(deployedCountRow?.count ?? 0);
    if (Number.isFinite(deployedCount) && deployedCount > 0) {
      throw new ValidationError('Cannot unpublish: this agent template is still deployed to one or more starships.');
    }

    // We need to:
    // - remove the agent_template
    // - remove any tool_templates that were only assigned to this agent_template
    // - remove marketing_content for the template + any deleted tool_templates (and delete their S3 blobs)
    const conn = getConnection();

    const { s3KeysToDelete } = await conn.transaction(async (client) => {
      // 1) Collect tool template ids assigned to this agent template
      const toolRows = await client.query<{ tool_template_id: string }>(
        `SELECT tool_template_id
         FROM agent_template_tool_templates
         WHERE agent_template_id = $1`,
        [templateId]
      );
      const toolTemplateIds = (toolRows.rows || [])
        .map((r) => (typeof r?.tool_template_id === 'string' ? r.tool_template_id.trim() : ''))
        .filter(Boolean);

      // 2) Count usage across ALL agent templates (so we only delete truly orphaned tool templates)
      const countRows =
        toolTemplateIds.length > 0
          ? await client.query<{ tool_template_id: string; cnt: string }>(
              `SELECT tool_template_id, COUNT(*)::text AS cnt
               FROM agent_template_tool_templates
               WHERE tool_template_id = ANY($1)
               GROUP BY tool_template_id`,
              [toolTemplateIds]
            )
          : { rows: [] as Array<{ tool_template_id: string; cnt: string }> };

      const usageByToolTemplateId = new Map<string, number>();
      for (const row of countRows.rows || []) {
        const tid = typeof row?.tool_template_id === 'string' ? row.tool_template_id.trim() : '';
        const n = Number(row?.cnt ?? 0);
        if (tid) usageByToolTemplateId.set(tid, Number.isFinite(n) ? n : 0);
      }

      const orphanToolTemplateIds = toolTemplateIds.filter((tid) => (usageByToolTemplateId.get(tid) ?? 0) <= 1);

      // 3) Collect marketing content S3 keys for cleanup (template + orphan tool templates)
      const mktRows = await client.query<{ id: string; s3_key: string | null }>(
        `SELECT id, s3_key
         FROM marketing_content
         WHERE is_active = true
           AND (
             (entity_type = 'agent_template' AND entity_id = $1)
             OR (entity_type = 'tool_template' AND entity_id = ANY($2::text[]))
           )`,
        [templateId, orphanToolTemplateIds]
      );

      const marketingContentIds = (mktRows.rows || [])
        .map((r) => (typeof r?.id === 'string' ? r.id.trim() : ''))
        .filter(Boolean);
      const s3KeysToDelete = (mktRows.rows || [])
        .map((r) => (typeof r?.s3_key === 'string' ? r.s3_key.trim() : ''))
        .filter(Boolean);

      // 4) Soft-delete marketing content rows (so marketplace pages stop rendering them)
      if (marketingContentIds.length > 0) {
        await client.query(
          `UPDATE marketing_content
           SET is_active = false, updated_at = NOW()
           WHERE id = ANY($1::text[])`,
          [marketingContentIds]
        );
      }

      // 5) Delete agent template row (removes it from marketplace listings; cascades junction relationships)
      await client.query(`DELETE FROM agent_templates WHERE id = $1`, [templateId]);

      // 6) Delete orphan tool templates
      if (orphanToolTemplateIds.length > 0) {
        await client.query(`DELETE FROM tool_templates WHERE id = ANY($1::text[])`, [orphanToolTemplateIds]);
      }

      // 7) Revert agent publication metadata to draft
      await client.query(
        `
        UPDATE agents
        SET
          publication_status = 'draft',
          publication_requested_by = NULL,
          publication_approved_by = NULL,
          publication_approved_at = NULL,
          publication_version_bump = NULL,
          publication_requested_version = NULL,
          publication_changelog = NULL,
          published_template_id = NULL,
          updated_at = NOW()
        WHERE id = $1
        `,
        [id]
      );

      return { s3KeysToDelete };
    });

    // Best-effort: delete the actual blobs from S3 (non-blocking).
    for (const key of s3KeysToDelete) {
      try {
        await deleteFromS3(key);
      } catch (err) {
        console.warn('[PUBLICATION] Failed to delete marketing content from S3:', err instanceof Error ? err.message : String(err));
      }
    }

    const updated = await this.agentRepository.findById(id);
    if (!updated) throw new NotFoundError('Agent', id);
    return updated;
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
    try {
      const templateRepo = new AgentTemplateRepository();
      const existingAvatar = await templateRepo.getAvatarStorageById(templateId);
      const existingUrl = existingAvatar?.avatarS3Key ? buildPublicS3ObjectUrl(existingAvatar.avatarS3Key) : undefined;

      // If the agent has no avatar, keep whatever the template already has.
      if (!agent.avatarAttachmentId) {
        return existingUrl;
      }

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
        // Promote the agent's (private) attachment object into a *public* template avatar object.
        // This lets marketplace/landing pages use a stable, direct S3 URL (no API avatar proxy endpoint).
        const destKey = buildAgentTemplatePublicAvatarS3Key({
          templateId,
          filename: existingAttachment.filename || 'avatar.png',
        });
        await copyObjectInS3({ sourceKey: existingAttachment.s3Key, destKey });

        await templateRepo.updateAvatarStorage(templateId, {
          avatarS3Key: destKey,
          avatarMimeType: existingAttachment.mimeType || 'image/png',
          avatarUpdatedAt: existingAttachment.createdAt || new Date().toISOString(),
        });
        return buildPublicS3ObjectUrl(destKey);
      }

      return existingUrl;
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

    const marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    } = {};

    // Copy avatar to template
    marketingContent.avatarUrl = await this.copyAvatarToTemplate(agent, templateId);

    // Copy problem statements text to template (no generation in publication flow)
    const existingTemplateStatements = await this.marketingContentRepository.findByEntityAndType(
      'agent_template',
      templateId,
      'problem_statements_text'
    );
    if (!existingTemplateStatements?.textContent) {
      const agentStatements = await this.marketingContentRepository.findByEntityAndType('agent', agent.id, 'problem_statements_text');
      if (agentStatements?.textContent) {
        await this.marketingContentRepository.createOrUpdate({
          entityType: 'agent_template',
          entityId: templateId,
          contentType: 'problem_statements_text',
          contentFormat: 'text',
          textContent: agentStatements.textContent,
          textFormat: agentStatements.textFormat || 'json',
          generationMetadata: agentStatements.generationMetadata || {},
          metadata: agentStatements.metadata || {},
        });
      }
    }

    // Read problem statements text from template for preview payload
    const templateStatements = await this.marketingContentRepository.findByEntityAndType(
      'agent_template',
      templateId,
      'problem_statements_text'
    );
    if (templateStatements?.textContent) {
      try {
        const parsed = JSON.parse(templateStatements.textContent || '[]');
        if (Array.isArray(parsed)) {
          marketingContent.problemStatementsText = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
      } catch {
        // ignore
      }
    }

    // Copy any existing profile images to template (no generation in publication flow)
    const finalAgent = await this.agentRepository.findById(agentId);
    if (!finalAgent) throw new NotFoundError('Agent', agentId);
    Object.assign(marketingContent, await this.profileImageService.copyAllProfileImagesToTemplate(finalAgent, templateId));

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
          agentRole: agent.role,
          agentSystemPrompt: agent.systemPrompt,
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

    // Copy problem statements text from agent → template (no generation here)
    try {
      const templateStatements = await this.marketingContentRepository.findByEntityAndType(
        'agent_template',
        templateId,
        'problem_statements_text'
      );
      if (!templateStatements?.textContent) {
        const agentStatements = await this.marketingContentRepository.findByEntityAndType(
          'agent',
          agent.id,
          'problem_statements_text'
        );
        if (agentStatements?.textContent) {
          await this.marketingContentRepository.createOrUpdate({
            entityType: 'agent_template',
            entityId: templateId,
            contentType: 'problem_statements_text',
            contentFormat: 'text',
            textContent: agentStatements.textContent,
            textFormat: agentStatements.textFormat || 'json',
            generationMetadata: agentStatements.generationMetadata || {},
            metadata: agentStatements.metadata || {},
          });
        }
      }
    } catch (err) {
      console.error('[PUBLICATION] Failed to copy problem statements text:', err);
      // Non-fatal - don't throw
    }

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

    // Confirm is now equivalent to approval/publish, without triggering marketing generation.
    // Ensure template exists so we can publish even if /publication/prepare was never called.
    const { templateId } = await this.ensureTemplate(agent, nextVersion);

    // Sync tools + copy existing assets to template (best-effort)
    await this.syncToolsToTemplate(agent, templateId, adminUserId);
    await this.copyAvatarToTemplate(agent, templateId);
    await this.profileImageService.ensureTemplateProfileImages(agent, templateId);
    try {
      const templateStatements = await this.marketingContentRepository.findByEntityAndType(
        'agent_template',
        templateId,
        'problem_statements_text'
      );
      if (!templateStatements?.textContent) {
        const agentStatements = await this.marketingContentRepository.findByEntityAndType('agent', agent.id, 'problem_statements_text');
        if (agentStatements?.textContent) {
          await this.marketingContentRepository.createOrUpdate({
            entityType: 'agent_template',
            entityId: templateId,
            contentType: 'problem_statements_text',
            contentFormat: 'text',
            textContent: agentStatements.textContent,
            textFormat: agentStatements.textFormat || 'json',
            generationMetadata: agentStatements.generationMetadata || {},
            metadata: agentStatements.metadata || {},
          });
        }
      }
    } catch (err) {
      console.error('[PUBLICATION] Failed to copy problem statements text during confirm:', err);
    }

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
