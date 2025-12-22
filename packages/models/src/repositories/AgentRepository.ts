import { AgentEntity } from '@/entities/AgentEntity';
import { ToolEntity } from '@/entities/ToolEntity';
import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { AttachmentRepository } from '@/repositories/AttachmentRepository';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueAgentSlug } from '@/utils/slugGenerator';
import { compareVersions } from '@/utils/version';
import {
  DEFAULT_AGENT_MAX_TOKENS,
  DEFAULT_AGENT_TIMEOUT_MS,
  MAX_AGENT_MAX_TOKENS,
  MAX_AGENT_TIMEOUT_MS,
  MIN_AGENT_MAX_TOKENS,
  MIN_AGENT_TIMEOUT_MS,
} from '@/constants/agentDefaults';
import { ValidationError } from '@starships/errors';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, ToolModel, AgentTemplateModel } from '@starships/protocol';
import type { AgentParamsWithoutMetadata } from '@starships/protocol';

export class AgentRepository extends BaseRepository {
  constructor() {
    super('AgentRepository');
  }

  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agents', 'created_at DESC');
        return fromDatabaseArray(AgentEntity, result);
      },
      'findAll',
      'Agent'
    );
  }

  async findById(id: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('agents', id);
        if (!result) return null;

        const agent = fromDatabase(AgentEntity, result);

        // If agent has a source template, fetch it and populate updateInfo
        if (agent.sourceTemplateId) {
          const connection = this.getConnection();
          const templateResult = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agent_templates WHERE id = $1', [
            agent.sourceTemplateId,
          ]);

          if (templateResult) {
            const template = fromDatabase(AgentTemplateEntity, templateResult);
            const comparison = compareVersions(agent.version, template.version);
            agent.updateInfo = {
              needsUpdate: comparison < 0,
              latestVersion: template.version,
              templateUpdatedAt: template.updatedAt,
            };
          }
        }

        return agent;
      },
      'findById',
      'Agent',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM agents WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        const agents = fromDatabaseArray(AgentEntity, result);

        // Collect unique source template IDs
        const templateIds = [...new Set(agents.filter((a) => a.sourceTemplateId).map((a) => a.sourceTemplateId))];

        // If there are templates, fetch them in a single query
        if (templateIds.length > 0) {
          const placeholders = templateIds.map((_, idx) => `$${idx + 1}`).join(', ');
          const templates = await connection.query<Record<string, unknown>>(
            `SELECT * FROM agent_templates WHERE id IN (${placeholders})`,
            templateIds
          );

          // Build a map of template ID to template for quick lookup
          const templateMap = new Map<string, AgentTemplateModel>();
          for (const template of templates) {
            const templateModel = fromDatabase(AgentTemplateEntity, template);
            templateMap.set(templateModel.id, templateModel);
          }

          // Populate updateInfo for each agent with a source template
          for (const agent of agents) {
            if (agent.sourceTemplateId) {
              const template = templateMap.get(agent.sourceTemplateId);
              if (template) {
                const comparison = compareVersions(agent.version, template.version);
                agent.updateInfo = {
                  needsUpdate: comparison < 0,
                  latestVersion: template.version,
                  templateUpdatedAt: template.updatedAt,
                };
              }
            }
          }
        }

        return agents;
      },
      'findByStarship',
      'Agent'
    );
  }

  async findBySlug(slug: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agents WHERE slug = $1', [slug]);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'findBySlug',
      'Agent',
      slug
    );
  }

  async updateStarship(agentId: string, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Validate starshipId exists
        const starshipCheck = await connection.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM starships WHERE id = $1', [
          starshipId,
        ]);

        if (!starshipCheck || starshipCheck.count === '0') {
          this.handleNotFound('Starship', starshipId);
        }

        // Update agent's starship_id and deployed_at
        const result = await connection.query<Record<string, unknown>>(
          `UPDATE agents
           SET starship_id = $1, deployed_at = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [starshipId, new Date().toISOString(), agentId]
        );

        if (!result || result.length === 0) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0]);
      },
      'updateStarship',
      'Agent',
      agentId
    );
  }

  async create(data: CreateAgentRequest, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Extract assignedToolSlugs for relationship creation
        const toolSlugsForRelationships = data.assignedToolSlugs || [];

        // Remove assignedToolSlugs from data before validation since AgentEntity doesn't have this field
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assignedToolSlugs: _, ...dataWithoutToolSlugs } = data;

        // Normalize numeric fields to sensible, safe defaults before validation
        const normalizedData: CreateAgentRequest = { ...dataWithoutToolSlugs };

        const hasValidNumber = (value: unknown): value is number =>
          typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);

        // Temperature: clamped by zod/class-validator; defaulting handled at higher layers.

        // maxTokens: clamp to configured bounds, default to shared default if missing/invalid
        if (hasValidNumber(normalizedData.maxTokens)) {
          normalizedData.maxTokens = Math.min(MAX_AGENT_MAX_TOKENS, Math.max(MIN_AGENT_MAX_TOKENS, normalizedData.maxTokens));
        } else {
          normalizedData.maxTokens = DEFAULT_AGENT_MAX_TOKENS;
        }

        // timeout (ms): clamp to configured bounds, default to shared default if missing/invalid
        if (hasValidNumber(normalizedData.timeout)) {
          normalizedData.timeout = Math.min(MAX_AGENT_TIMEOUT_MS, Math.max(MIN_AGENT_TIMEOUT_MS, normalizedData.timeout));
        } else {
          normalizedData.timeout = DEFAULT_AGENT_TIMEOUT_MS;
        }

        // Validate using normalized data and include starshipId which is required on create
        await AgentEntity.validate({ ...normalizedData, starshipId }, 'create');

        const now = new Date().toISOString();

        // Create agent properties for PostgreSQL
        const agentProps = {
          // Core AgentParams fields
          name: normalizedData.name,
          slug:
            normalizedData.slug ||
            (await generateUniqueAgentSlug((normalizedData.name || 'agent').toLowerCase().replace(/\s+/g, '-'), this)), // Ensure non-empty slug
          description: normalizedData.description,
          model: normalizedData.model,
          // Optional categorization (aligns with templates)
          category: normalizedData.category || 'general',
          temperature: normalizedData.temperature,
          maxTokens: normalizedData.maxTokens,
          reasoning: (normalizedData as unknown as { reasoning?: unknown }).reasoning,
          timeout: normalizedData.timeout,
          systemPrompt: normalizedData.systemPrompt,
          state: normalizedData.state,
          blueprint: normalizedData.blueprint,
          previewPrompts: normalizedData.previewPrompts,

          // Versioning fields
          version: data.version || '1.0.0',
          templateSnapshotAt: data.templateSnapshotAt,

          // Publication workflow defaults
          publicationStatus: 'draft',
          publicationRequestedBy: undefined,
          publicationApprovedBy: undefined,
          publicationApprovedAt: undefined,

          // PostgreSQL specific fields
          starshipId: starshipId, // Direct foreign key
          deployedAt: now, // Agent is deployed immediately upon creation
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const agentEntity = toEntityInstance(AgentEntity, agentProps as unknown as Record<string, unknown>);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        const agent = fromDatabase(AgentEntity, result);

        // Create tool relationships if assignedToolSlugs provided
        if (toolSlugsForRelationships.length > 0) {
          await this.assignToolsToAgent(agent.id, toolSlugsForRelationships, starshipId);
        }

        return agent;
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) {
          return null;
        }

        // Ensure numeric fields are properly typed (convert strings to numbers if needed)
        // Only convert values that are not null/undefined to avoid NaN or 0 from null
        const typedUpdates: UpdateAgentRequest = { ...updates };

        if (updates.temperature !== undefined && updates.temperature !== null) {
          typedUpdates.temperature = Number(updates.temperature);
        }
        if (updates.maxTokens !== undefined && updates.maxTokens !== null) {
          typedUpdates.maxTokens = Number(updates.maxTokens);
        }
        if (updates.timeout !== undefined && updates.timeout !== null) {
          typedUpdates.timeout = Number(updates.timeout);
        }

        // Use lean validation from AgentEntity for updates
        await AgentEntity.validate(typedUpdates, 'update');

        const updateProps: Partial<AgentModel> = {
          ...(typedUpdates as Partial<AgentModel>),
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(AgentEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agents', id, filteredUpdateData);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'update',
      'Agent',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL CASCADE rules will handle relationships automatically
        return await this.deleteEntity('agents', id);
      },
      'delete',
      'Agent',
      id
    );
  }

  async searchAgents(query: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Use PostgreSQL full-text search
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM agents
           WHERE to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')) @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')), plainto_tsquery('english', $1)) DESC
           LIMIT 20`,
          [query]
        );
        return fromDatabaseArray(AgentEntity, result);
      },
      'searchAgents',
      'Agent'
    );
  }

  async getAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Get tools related to agent through junction table, filtered by starship
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1 AND t.starship_id = $2
           ORDER BY t.created_at DESC`,
          [agentId, starshipId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'getAgentTools',
      'Agent',
      agentId
    );
  }

  /**
   * Get the stored permission for a given agent↔tool (by tool slug within a starship).
   * Returns null when the tool is not assigned to the agent.
   */
  async getAgentToolPermissionBySlug(
    agentId: string,
    starshipId: string,
    toolSlug: string
  ): Promise<'allow' | 'ask' | 'deny' | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ permission: 'allow' | 'ask' | 'deny' }>(
          `
          SELECT at.permission as permission
          FROM agent_tools at
          INNER JOIN tools t ON t.id = at.tool_id
          WHERE at.agent_id = $1 AND t.starship_id = $2 AND t.slug = $3
          LIMIT 1
          `,
          [agentId, starshipId, toolSlug]
        );
        return row?.permission ?? null;
      },
      'getAgentToolPermissionBySlug',
      'Agent',
      agentId
    );
  }

  /**
   * Get agent→tool permissions (join metadata) for a specific starship.
   * Returns only rows present in agent_tools; callers can treat missing pairs as 'deny'.
   */
  async getStarshipAgentToolPermissions(starshipId: string): Promise<Array<{ agentId: string; toolId: string; toolSlug: string; permission: 'allow' | 'ask' | 'deny' }>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{ agent_id: string; tool_id: string; tool_slug: string; permission: 'allow' | 'ask' | 'deny' }>(
          `
          SELECT
            at.agent_id as agent_id,
            t.id as tool_id,
            t.slug as tool_slug,
            at.permission as permission
          FROM agent_tools at
          INNER JOIN agents a ON a.id = at.agent_id
          INNER JOIN tools t ON t.id = at.tool_id
          WHERE a.starship_id = $1 AND t.starship_id = $1
          ORDER BY a.created_at DESC, t.created_at DESC
          `,
          [starshipId]
        );

        return (rows || []).map((r) => ({
          agentId: r.agent_id,
          toolId: r.tool_id,
          toolSlug: r.tool_slug,
          permission: r.permission,
        }));
      },
      'getStarshipAgentToolPermissions',
      'Agent'
    );
  }

  /**
   * Upsert a permission for an agent/tool pair by tool slug within a starship.
   * This is intentionally starship-scoped to prevent cross-starship tool slugs.
   */
  async setAgentToolPermissionBySlug(args: { agentId: string; starshipId: string; toolSlug: string; permission: 'allow' | 'ask' | 'deny' }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const { agentId, starshipId, toolSlug, permission } = args;
        if (!agentId?.trim() || !starshipId?.trim() || !toolSlug?.trim()) {
          throw new Error('agentId, starshipId, and toolSlug are required');
        }

        const connection = this.getConnection();
        const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [toolSlug, starshipId]);
        if (!toolResult?.id) {
          throw new Error(`Tool not found: ${toolSlug} on starship ${starshipId}`);
        }

        // Important semantic: permissions do NOT implicitly assign tools.
        // Only update an existing relationship row. (Assignment is handled by the /agents/:id/tools endpoints.)
        const res = await connection.queryWithResult(
          `
          UPDATE agent_tools
          SET permission = $3
          WHERE agent_id = $1 AND tool_id = $2
          `,
          [agentId, toolResult.id, permission]
        );

        if (!res.rowCount) {
          throw new ValidationError('Tool is not assigned to agent', 'toolSlug', { agentId, toolSlug });
        }
      },
      'setAgentToolPermissionBySlug',
      'Agent',
      args.agentId
    );
  }

  // ============================================================================
  // AGENT TEMPLATE RELATIONSHIPS
  // ============================================================================

  /**
   * Create Agent from AgentTemplate with proper relationship
   */
  async createFromTemplate(templateId: string, starshipId: string, customizations?: Partial<CreateAgentRequest>): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use AgentTemplateRepository to get template
        const templateRepository = new AgentTemplateRepository();
        // Important: use INTERNAL template fetch so we retain blueprint/state/systemPrompt.
        // Public findById() intentionally strips these fields for marketplace/client consumption.
        const template = await templateRepository.findInternalById(templateId);

        if (!template) {
          this.handleNotFound('AgentTemplate', templateId);
        }

        // Generate unique slug based on template slug
        const slug = await generateUniqueAgentSlug(template.slug, this);

        // Create agent from template with optional customizations
        const now = new Date().toISOString();
        const agentData: CreateAgentRequest = {
          name: customizations?.name || template.name,
          slug,
          description: customizations?.description || template.description,
          model: customizations?.model || template.model,
          temperature: customizations?.temperature ?? template.temperature,
          maxTokens: customizations?.maxTokens ?? template.maxTokens,
          reasoning:
            (customizations as unknown as { reasoning?: AgentParamsWithoutMetadata['reasoning'] | null })?.reasoning ??
            (template as unknown as { reasoning?: AgentParamsWithoutMetadata['reasoning'] | null })?.reasoning ??
            undefined,
          timeout: customizations?.timeout ?? template.timeout,
          systemPrompt: customizations?.systemPrompt || template.systemPrompt,
          state: customizations?.state || template.state || { tools: [], messages: [] },
          blueprint: customizations?.blueprint || template.blueprint,
          previewPrompts: customizations?.previewPrompts || template.previewPrompts,
          assignedToolSlugs: customizations?.assignedToolSlugs,
          sourceTemplateId: template.id,
          version: template.version, // Copy template version
          templateSnapshotAt: now, // Capture snapshot time
        };

        // Create agent with source_template_id foreign key
        const agentProps = {
          ...agentData,
          starshipId: starshipId,
          sourceTemplateId: template.id, // Set source_template_id foreign key
          deployedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        const agentEntity = toEntityInstance(AgentEntity, agentProps);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        const agent = fromDatabase(AgentEntity, result);

        // Avatar propagation on create:
        // If the template has a public avatar stored (avatar_s3_key), create an attachment reference
        // owned by this starship and link it on the newly created agent.
        //
        // This covers initial deployments (e.g. starship creation) where updateFromTemplate() is not called.
        try {
          const storage = await templateRepository.getAvatarStorageById(templateId);
          if (storage?.avatarS3Key) {
            const mimeType = storage.avatarMimeType || 'image/png';
            const extForMime = (mt: string): string => {
              if (mt.includes('png')) return 'png';
              if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
              if (mt.includes('webp')) return 'webp';
              if (mt.includes('gif')) return 'gif';
              return 'img';
            };
            const filename = `template-avatar__${templateId}__${agent.id}.${extForMime(mimeType)}`;

            const attachmentRepo = new AttachmentRepository();
            const existing = await attachmentRepo.findByStarshipAndS3Key(starshipId, storage.avatarS3Key);
            const created =
              existing ??
              (await attachmentRepo.create({
                starshipId,
                messageId: undefined,
                filename,
                mimeType,
                sizeBytes: 0,
                s3Key: storage.avatarS3Key,
              }));

            const updatedWithAvatar = await this.update(agent.id, { avatarAttachmentId: created.id });
            if (updatedWithAvatar) {
              // Return the hydrated/updated agent with avatarAttachmentId set
              return updatedWithAvatar;
            }
          }
        } catch {
          // Best-effort: do not fail agent creation if avatar propagation fails.
        }

        // Increment template usage count
        const connection = this.getConnection();
        await connection.query('UPDATE agent_templates SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1', [templateId]);

        return agent;
      },
      'createFromTemplate',
      'Agent'
    );
  }

  /**
   * Get the AgentTemplate that this Agent was created from
   */
  async getSourceTemplate(agentId: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT at.* FROM agent_templates at
           INNER JOIN agents a ON a.source_template_id = at.id
           WHERE a.id = $1`,
          [agentId]
        );
        return result ? fromDatabase(AgentTemplateEntity, result) : null;
      },
      'getSourceTemplate',
      'Agent',
      agentId
    );
  }

  // ============================================================================
  // AGENT→TOOL DIRECT RELATIONSHIPS
  // ============================================================================

  /**
   * Create a relationship between Agent and Tool using junction table
   */
  async addToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();

        // Check if both entities exist
        const agentExists = await connection.queryOne('SELECT id FROM agents WHERE id = $1', [agentId]);
        const toolExists = await connection.queryOne('SELECT id FROM tools WHERE id = $1', [toolId]);

        if (!agentExists || !toolExists) {
          throw new Error('Agent or Tool not found');
        }

        // Insert into junction table (ON CONFLICT DO NOTHING to avoid duplicates)
        await connection.query(
          `INSERT INTO agent_tools (agent_id, tool_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (agent_id, tool_id) DO NOTHING`,
          [agentId, toolId]
        );
      },
      'addToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Remove a relationship between Agent and Tool from junction table
   */
  async removeToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1 AND tool_id = $2', [agentId, toolId]);
      },
      'removeToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Set permissions for all tools currently assigned to an agent (existing join rows only).
   * Useful for bootstrapping default agents created during starship creation.
   */
  async setAllAssignedToolPermissionsForAgent(agentId: string, permission: 'allow' | 'ask' | 'deny'): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }
        const connection = this.getConnection();
        const res = await connection.queryWithResult(`UPDATE agent_tools SET permission = $2 WHERE agent_id = $1`, [agentId, permission]);
        return res.rowCount ?? 0;
      },
      'setAllAssignedToolPermissionsForAgent',
      'Agent',
      agentId
    );
  }

  /**
   * Get all Tools that an Agent uses via junction table relationships
   */
  async getAgentToolsByRelationships(agentId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1
           ORDER BY t.name`,
          [agentId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'getAgentToolsByRelationships',
      'Agent',
      agentId
    );
  }

  /**
   * Assign tools to an agent by their slugs and starship - creates junction table relationships
   */
  async assignToolsToAgent(agentId: string, toolSlugs: string[], starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Remove existing tool relationships for this agent
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1', [agentId]);

        // Create new relationships for each tool slug
        for (const toolSlug of toolSlugs) {
          // Find the tool by slug and starship
          const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
            toolSlug,
            starshipId,
          ]);

          if (toolResult) {
            // Create relationship via junction table
            await this.addToolRelationship(agentId, toolResult.id);
          }
        }
      },
      'assignToolsToAgent',
      'Agent',
      agentId
    );
  }

  // ============================================================================
  // TEMPLATE VERSIONING & UPDATE MANAGEMENT
  // ============================================================================

  /**
   * Update agent with latest template data
   */
  async updateFromTemplate(agentId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const agent = await this.findById(agentId);

        if (!agent) {
          this.handleNotFound('Agent', agentId);
        }

        if (!agent.sourceTemplateId) {
          throw new Error('Agent is not linked to a template');
        }

        const templateRepo = new AgentTemplateRepository();
        // IMPORTANT: use INTERNAL template fetch so we retain blueprint/state/systemPrompt.
        // Public findById() intentionally strips these fields for marketplace/client consumption.
        const template = await templateRepo.findInternalById(agent.sourceTemplateId);

        if (!template) {
          this.handleNotFound('AgentTemplate', agent.sourceTemplateId);
        }

        // Copy current template data to agent.
        // Important: avoid copying runtime-owned state; only sync template-owned fields.
        const updates: UpdateAgentRequest = {
          systemPrompt: template.systemPrompt,
          blueprint: template.blueprint,
          model: template.model,
          version: template.version, // Copy template version to agent
          templateSnapshotAt: new Date().toISOString(),
          // Keep agent category + preview prompts aligned with template for UI/marketplace display.
          category: template.category,
          previewPrompts: template.previewPrompts,
        };

        // Reasoning config: allow templates to define it, but don't force-clear if missing.
        if (template.reasoning !== undefined) {
          updates.reasoning = template.reasoning ?? null;
        }

        // Only copy optional numeric fields if they're defined in the template
        if (template.temperature !== null && template.temperature !== undefined) {
          updates.temperature = template.temperature;
        }
        if (template.maxTokens !== null && template.maxTokens !== undefined) {
          updates.maxTokens = template.maxTokens;
        }
        if (template.timeout !== null && template.timeout !== undefined) {
          updates.timeout = template.timeout;
        }

        // Avatar sync:
        // - Templates store avatar as S3 pointer fields (avatar_s3_key/mime/updated_at).
        // - Agents store avatar as Attachment FK (avatarAttachmentId).
        // We propagate template avatar to the agent ONLY if:
        // - agent has no avatar, OR
        // - agent avatar was previously synced from a template (filename prefix), OR
        // - previously-synced avatar points to a different S3 key than the template now uses.
        const storage = await templateRepo.getAvatarStorageById(agent.sourceTemplateId);
        if (storage?.avatarS3Key) {
          const attachmentRepo = new AttachmentRepository();

          const isSyncedFilename = (filename: unknown): boolean => typeof filename === 'string' && filename.startsWith('template-avatar__');

          const extForMime = (mimeType: string | undefined): string => {
            if (!mimeType) return 'img';
            if (mimeType.includes('png')) return 'png';
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
            if (mimeType.includes('webp')) return 'webp';
            if (mimeType.includes('gif')) return 'gif';
            return 'img';
          };

          let shouldSetAvatar = false;
          const existingId = agent.avatarAttachmentId;
          let existingSyncedIdToDelete: string | undefined;

          if (!existingId) {
            shouldSetAvatar = true;
          } else {
            const existing = await attachmentRepo.findById(existingId);
            if (!existing) {
              shouldSetAvatar = true;
              existingSyncedIdToDelete = existingId;
            } else if (existing.starshipId !== agent.starshipId) {
              // Defensive: data inconsistency; replace.
              shouldSetAvatar = true;
            } else if (!isSyncedFilename(existing.filename)) {
              // Custom/user avatar: do not overwrite.
              shouldSetAvatar = false;
            } else if (existing.s3Key !== storage.avatarS3Key) {
              // Previously synced, but template avatar changed: refresh.
              shouldSetAvatar = true;
              existingSyncedIdToDelete = existingId;
            } else {
              // Already synced and points to the same template S3 key: no-op.
              shouldSetAvatar = false;
            }
          }

          if (shouldSetAvatar) {
            const mimeType = storage.avatarMimeType || 'image/png';
            const filename = `template-avatar__${agent.sourceTemplateId}__${agent.id}.${extForMime(mimeType)}`;

            const existing = await attachmentRepo.findByStarshipAndS3Key(agent.starshipId, storage.avatarS3Key);
            const created =
              existing ??
              (await attachmentRepo.create({
                starshipId: agent.starshipId,
                messageId: undefined,
                filename,
                mimeType,
                sizeBytes: 0,
                s3Key: storage.avatarS3Key,
                imageWidth: undefined,
                imageHeight: undefined,
              }));

            updates.avatarAttachmentId = created.id;

            // Best-effort cleanup: remove the old synced attachment row (never deletes S3 here).
            if (existingSyncedIdToDelete && existingSyncedIdToDelete !== created.id) {
              try {
                await attachmentRepo.delete(existingSyncedIdToDelete);
              } catch {
                // ignore
              }
            }
          }
        }

        const updated = await this.update(agentId, updates);
        if (!updated) {
          throw new Error('Failed to update agent from template');
        }

        return updated;
      },
      'updateFromTemplate',
      'Agent',
      agentId
    );
  }

  /**
   * Atomically mark an agent as pending publication and persist request metadata.
   *
   * Uses SELECT ... FOR UPDATE inside a transaction to prevent concurrent
   * publication requests from both succeeding when the agent is already pending.
   */
  async requestPublicationAtomic(
    id: string,
    updates: {
      publicationStatus: AgentModel['publicationStatus'];
      publicationRequestedBy: string;
      publicationVersionBump: 'patch' | 'minor' | 'major';
      publicationRequestedVersion: string;
      publicationChangelog: string;
    }
  ): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        const agent = await connection.transaction<AgentModel | null>(async (client) => {
          // Lock the agent row to serialize concurrent publication requests
          const selectRes = await client.query<Record<string, unknown>>('SELECT * FROM agents WHERE id = $1 FOR UPDATE', [id]);
          const row = selectRes.rows?.[0];

          if (!row) {
            this.handleNotFound('Agent', id);
          }

          const currentAgent = fromDatabase(AgentEntity, row as Record<string, unknown>);

          // If another request already moved this agent to pending_approval,
          // surface the same validation error as the service-level guard.
          if (currentAgent.publicationStatus === 'pending_approval') {
            throw new ValidationError('Agent is already pending approval');
          }

          const updateRes = await client.query<Record<string, unknown>>(
            `
            UPDATE agents
            SET
              publication_status = $2,
              publication_requested_by = $3,
              publication_version_bump = $4,
              publication_requested_version = $5,
              publication_changelog = $6,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [
              id,
              updates.publicationStatus,
              updates.publicationRequestedBy,
              updates.publicationVersionBump,
              updates.publicationRequestedVersion,
              updates.publicationChangelog,
            ]
          );

          const updatedRow = updateRes.rows?.[0];
          if (!updatedRow) {
            this.handleNotFound('Agent', id);
          }

          return fromDatabase(AgentEntity, updatedRow as Record<string, unknown>);
        });

        if (!agent) {
          this.handleNotFound('Agent', id);
        }

        return agent;
      },
      'requestPublicationAtomic',
      'Agent',
      id
    );
  }
}
