/**
 * AgentTemplateMarketingService
 *
 * Instance-admin-only tooling to generate marketing content for a *published agent template*.
 * This powers the public `/marketplace/agents/[slug]` marketing pages.
 */
import { ForbiddenError, NotFoundError } from '@starships/errors';
import { AgentTemplateRepository, MarketingContentRepository, UserRepository } from '@starships/models';
import type { AgentTemplateModel, UserModel } from '@starships/protocol';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { triggerNextRevalidate } from '@/utils/nextRevalidate';
import { buildPublicS3ObjectUrl, generatePresignedUrlInline, uploadAgentTemplateProfileImageToS3 } from '@/utils/s3-helper';
import { TemplateMarketingImageGenerationService } from './TemplateMarketingImageGenerationService';
import { ExecutionItemUtils, LLM } from '@starships/autopilot';
import OpenAI from 'openai';
import type { HostRuntime, LlmHostRequest } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';

export class AgentTemplateMarketingService {
  private agentTemplateRepository: AgentTemplateRepository;
  private marketingContentRepository: MarketingContentRepository;
  private userRepository: UserRepository;
  private imageGen: TemplateMarketingImageGenerationService;
  private hostRuntime: HostRuntime;

  constructor() {
    this.agentTemplateRepository = new AgentTemplateRepository();
    this.marketingContentRepository = new MarketingContentRepository();
    this.userRepository = new UserRepository();
    this.imageGen = new TemplateMarketingImageGenerationService();
    this.hostRuntime = this.createOpenRouterHostRuntime();
  }

  private createOpenRouterHostRuntime(): HostRuntime {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }
    const openai = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return {
      http: async () => {
        throw new Error('HostRuntime.http is not available for template marketing generation');
      },
      connectorAction: async () => {
        throw new Error('HostRuntime.connectorAction is not available for template marketing generation');
      },
      llm: async (request: LlmHostRequest): Promise<AsyncIterable<unknown>> => {
        const req = { ...(request as any), stream: true };
        return (await openai.chat.completions.create(req)) as unknown as AsyncIterable<unknown>;
      },
    };
  }

  private async generateProblemStatements(template: AgentTemplateModel): Promise<{ statements: string[]; model: string }> {
    const assignedToolSlugs = Array.isArray(template.assignedToolSlugs) ? template.assignedToolSlugs : [];
    const coreCapabilities = assignedToolSlugs.length > 0 ? assignedToolSlugs.join(', ') : template.role || 'general assistance';
    const domainContext = template.description ? template.description.split(/[.!?]/)[0].trim().slice(0, 100) : template.role || 'general assistance';

    const spec = {
      version: 'marketplace_problem_statements_v1',
      output: { format: 'json_array_of_strings', count: 3, max_chars_each: 200 },
      agent: {
        name: template.name,
        role: template.role,
        category: template.category || 'general',
        description: template.description || '',
        core_capabilities: coreCapabilities.slice(0, 200),
        domain_context: domainContext,
      },
      requirements: [
        'Generate exactly 3 user-facing problem statements (no more, no less).',
        'Conversational, empathetic, user-first.',
        'Relatable and specific to the agent domain.',
        'Mix formats: questions and statements.',
        'Return ONLY a JSON array of strings. No other text.',
      ],
    };

    const llm = new LLM(
      {
        model: template.model,
        messages: [
          {
            role: 'user',
            content: `JSON_SPEC:\n${JSON.stringify(spec, null, 2)}`,
          },
        ],
        temperature: 0.7,
        maxTokens: 500,
        stream: true,
      } as any,
      {
        hostRuntime: this.hostRuntime,
        runtimeEnv: { TEMPLATE_ID: template.id },
      } as any
    );

    const items = await llm.execute();
    const response = ExecutionItemUtils.unwrapSingle(items) as any;
    const text = String(response?.choices?.[0]?.message?.content || '').trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const statements = Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => String(s).trim()).slice(0, 3)
      : [];
    if (statements.length !== 3) {
      throw new Error(`Problem statements generation returned ${statements.length} statements (expected 3)`);
    }
    return { statements, model: template.model };
  }

  async generateTemplateMarketingContent(
    templateId: string,
    adminUserId: string,
    options?: {
      onStep?: (
        key:
          | 'load_template'
          | 'generate_problem_statements'
          | 'load_avatar_reference'
          | 'generate_problem_image'
          | 'generate_capabilities_image'
          | 'generate_try_prompts_image'
          | 'persist_template_assets'
          | 'revalidate',
        status: 'running' | 'completed' | 'failed'
      ) => void;
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

    // ---------------------------------------------------------------------
    // 1) Generate problem statements text (marketing_content row for template)
    // ---------------------------------------------------------------------
    options?.onStep?.('generate_problem_statements', 'running');
    const statementsResult = await this.generateProblemStatements(template);
    const statements = statementsResult.statements;

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
    // 2) Generate profile images using template avatar as reference + store in template
    // ---------------------------------------------------------------------
    options?.onStep?.('load_avatar_reference', 'running');
    const avatarStorage = await this.agentTemplateRepository.getAvatarStorageById(templateId);
    if (!avatarStorage?.avatarS3Key) {
      throw new Error('Template avatar is missing; cannot generate marketing images without a reference avatar');
    }
    const avatarUrl = await generatePresignedUrlInline(avatarStorage.avatarS3Key, 60);
    options?.onStep?.('load_avatar_reference', 'completed');

    // Compute core capabilities + domain context
    const assignedToolSlugs = Array.isArray(template.assignedToolSlugs) ? template.assignedToolSlugs : [];
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

    options?.onStep?.('generate_problem_image', 'running');
    const genProblem = await this.imageGen.generateProfileImage({
      template,
      avatarImageUrl: avatarUrl,
      type: 'problem_statements',
      coreCapabilities,
      domainContext,
    });
    options?.onStep?.('generate_problem_image', 'completed');

    options?.onStep?.('generate_capabilities_image', 'running');
    const genCaps = await this.imageGen.generateProfileImage({
      template,
      avatarImageUrl: avatarUrl,
      type: 'capabilities',
      coreCapabilities,
      domainContext,
    });
    options?.onStep?.('generate_capabilities_image', 'completed');

    options?.onStep?.('generate_try_prompts_image', 'running');
    const genTry = await this.imageGen.generateProfileImage({
      template,
      avatarImageUrl: avatarUrl,
      type: 'try_these_prompts',
      coreCapabilities,
      domainContext,
    });
    options?.onStep?.('generate_try_prompts_image', 'completed');

    options?.onStep?.('persist_template_assets', 'running');
    const updatedAt = new Date().toISOString();
    const [problemS3Key, capsS3Key, tryS3Key] = await Promise.all([
      uploadAgentTemplateProfileImageToS3({
        templateId,
        type: 'problem_statements',
        filename: `problem-statements.webp`,
        mimeType: genProblem.mimeType,
        buffer: genProblem.buffer,
      }),
      uploadAgentTemplateProfileImageToS3({
        templateId,
        type: 'capabilities',
        filename: `capabilities.webp`,
        mimeType: genCaps.mimeType,
        buffer: genCaps.buffer,
      }),
      uploadAgentTemplateProfileImageToS3({
        templateId,
        type: 'try_these_prompts',
        filename: `try-these-prompts.webp`,
        mimeType: genTry.mimeType,
        buffer: genTry.buffer,
      }),
    ]);

    await Promise.all([
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'problem_statements', {
        s3Key: problemS3Key,
        mimeType: genProblem.mimeType,
        updatedAt,
      }),
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'capabilities', {
        s3Key: capsS3Key,
        mimeType: genCaps.mimeType,
        updatedAt,
      }),
      this.agentTemplateRepository.updateProfileImageStorage(templateId, 'try_these_prompts', {
        s3Key: tryS3Key,
        mimeType: genTry.mimeType,
        updatedAt,
      }),
    ]);
    options?.onStep?.('persist_template_assets', 'completed');

    // Revalidate public ISR caches so the marketplace page updates quickly.
    options?.onStep?.('revalidate', 'running');
    triggerNextRevalidate({ tags: ['public-agent-templates'] });
    options?.onStep?.('revalidate', 'completed');

    // Compute cache-busting URLs based on updated storage timestamps.
    const problemStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'problem_statements');
    const capsStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'capabilities');
    const tryStorage = await this.agentTemplateRepository.getProfileImageStorageById(templateId, 'try_these_prompts');

    const publicAvatarUrl = avatarStorage?.avatarS3Key ? buildPublicS3ObjectUrl(avatarStorage.avatarS3Key) : undefined;
    const pv = problemStorage?.updatedAt ? new Date(problemStorage.updatedAt).getTime() : Date.now();
    const cv = capsStorage?.updatedAt ? new Date(capsStorage.updatedAt).getTime() : Date.now();
    const tv = tryStorage?.updatedAt ? new Date(tryStorage.updatedAt).getTime() : Date.now();

    return {
      templateId,
      marketingContent: {
        ...(publicAvatarUrl ? { avatarUrl: publicAvatarUrl } : {}),
        problemStatementsText: statements,
        problemStatementsImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/problem-statements?v=${pv}`,
        capabilitiesImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/capabilities?v=${cv}`,
        tryThesePromptsImageUrl: `/api/v1/agent-templates/${templateId}/profile-images/try-these-prompts?v=${tv}`,
      },
    };
  }
}

