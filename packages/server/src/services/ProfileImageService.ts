/**
 * Profile Image Service
 *
 * Handles copying profile images from agents to templates during publication.
 * Centralizes the logic for managing the three profile image types.
 */

import { AgentTemplateRepository } from '@starships/models';
import { AttachmentService } from './AttachmentService';
import type { AgentModel } from '@starships/protocol';

export type ProfileImageType = 'problem_statements' | 'capabilities' | 'try_these_prompts';

export class ProfileImageService {
  private attachmentService: AttachmentService;
  private templateRepo: AgentTemplateRepository;

  constructor() {
    this.attachmentService = new AttachmentService();
    this.templateRepo = new AgentTemplateRepository();
  }

  /**
   * Convert timestamp string to milliseconds, handling invalid values
   */
  private toMs(s?: string): number {
    if (!s) return NaN;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  /**
   * Copy a single profile image from agent to template if needed
   */
  async copyProfileImageToTemplate(
    agent: AgentModel,
    templateId: string,
    type: ProfileImageType
  ): Promise<{ updated: boolean; url?: string }> {
    const fieldMap: Record<ProfileImageType, keyof AgentModel> = {
      problem_statements: 'problemStatementsAttachmentId',
      capabilities: 'capabilitiesAttachmentId',
      try_these_prompts: 'tryThesePromptsAttachmentId',
    };

    const attachmentField = fieldMap[type];
    const attachmentId = agent[attachmentField] as string | undefined;

    if (!attachmentId) {
      return { updated: false };
    }

    try {
      const existingStorage = await this.templateRepo.getProfileImageStorageById(templateId, type);
      const existingAttachment = await this.attachmentService.getAttachmentWithUrl(attachmentId, agent.starshipId);

      const templateImageMs = this.toMs(existingStorage?.updatedAt);
      const attachmentCreatedMs = this.toMs(existingAttachment?.createdAt);
      const shouldUpdate =
        !existingStorage?.s3Key ||
        (Number.isFinite(templateImageMs) && Number.isFinite(attachmentCreatedMs) && attachmentCreatedMs > templateImageMs) ||
        (!Number.isFinite(templateImageMs) && Number.isFinite(attachmentCreatedMs));

      if (shouldUpdate && existingAttachment?.s3Key) {
        await this.templateRepo.updateProfileImageStorage(templateId, type, {
          s3Key: existingAttachment.s3Key,
          mimeType: existingAttachment.mimeType || 'image/webp',
          updatedAt: existingAttachment.createdAt || new Date().toISOString(),
        });

        // Fetch updated storage to get the actual updatedAt timestamp for cache-busting
        const updatedStorage = await this.templateRepo.getProfileImageStorageById(templateId, type);
        const cacheBuster = updatedStorage?.updatedAt ? new Date(updatedStorage.updatedAt).getTime() : Date.now();

        const urlMap: Record<ProfileImageType, string> = {
          problem_statements: `/api/v1/agent-templates/${templateId}/profile-images/problem-statements?v=${cacheBuster}`,
          capabilities: `/api/v1/agent-templates/${templateId}/profile-images/capabilities?v=${cacheBuster}`,
          try_these_prompts: `/api/v1/agent-templates/${templateId}/profile-images/try-these-prompts?v=${cacheBuster}`,
        };

        return { updated: true, url: urlMap[type] };
      }

      // Return existing URL even if not updated
      if (existingStorage?.s3Key) {
        const cacheBuster = existingStorage.updatedAt ? new Date(existingStorage.updatedAt).getTime() : Date.now();
        const urlMap: Record<ProfileImageType, string> = {
          problem_statements: `/api/v1/agent-templates/${templateId}/profile-images/problem-statements?v=${cacheBuster}`,
          capabilities: `/api/v1/agent-templates/${templateId}/profile-images/capabilities?v=${cacheBuster}`,
          try_these_prompts: `/api/v1/agent-templates/${templateId}/profile-images/try-these-prompts?v=${cacheBuster}`,
        };
        return { updated: false, url: urlMap[type] };
      }

      return { updated: false };
    } catch (err) {
      console.error(`[PROFILE-IMAGE] Failed to copy ${type} image:`, err);
      return { updated: false };
    }
  }

  /**
   * Copy all profile images from agent to template
   */
  async copyAllProfileImagesToTemplate(
    agent: AgentModel,
    templateId: string
  ): Promise<{
    problemStatementsImageUrl?: string;
    capabilitiesImageUrl?: string;
    tryThesePromptsImageUrl?: string;
  }> {
    const results = await Promise.all([
      this.copyProfileImageToTemplate(agent, templateId, 'problem_statements'),
      this.copyProfileImageToTemplate(agent, templateId, 'capabilities'),
      this.copyProfileImageToTemplate(agent, templateId, 'try_these_prompts'),
    ]);

    return {
      problemStatementsImageUrl: results[0].url,
      capabilitiesImageUrl: results[1].url,
      tryThesePromptsImageUrl: results[2].url,
    };
  }

  /**
   * Ensure template has all profile images from agent (used in approvePublication)
   */
  async ensureTemplateProfileImages(agent: AgentModel, templateId: string): Promise<void> {
    try {
      await this.copyAllProfileImagesToTemplate(agent, templateId);
    } catch (err) {
      console.error('[PROFILE-IMAGE] Failed to ensure template profile images:', err);
      // Non-fatal - don't throw
    }
  }
}
