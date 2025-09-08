/**
 * Agent Template Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and AgentEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { AgentTemplateModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Custom transformers for the AgentTemplateEntity
 */
export class AgentTemplateTransformers {
  /**
   * Transform usage count to ensure it's always a number
   */
  static UsageCountTransform() {
    return Transform(({ value }) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseInt(value, 10) || 0;
      return 0;
    });
  }

  /**
   * Transform temperature to ensure proper range
   */
  static TemperatureTransform() {
    return Transform(({ value }) => {
      if (value == null) return undefined;
      const temp = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(temp)) return undefined;
      return Math.max(0, Math.min(2, temp)); // Clamp between 0 and 2
    });
  }

  /**
   * Transform maxTokens to ensure it's a positive integer
   */
  static MaxTokensTransform() {
    return Transform(({ value }) => {
      if (value == null) return undefined;
      const tokens = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(tokens) || tokens < 1) return undefined;
      return Math.min(tokens, 100000); // Reasonable upper limit
    });
  }

  /**
   * Transform timeout to ensure it's a positive integer (milliseconds)
   */
  static TimeoutTransform() {
    return Transform(({ value }) => {
      if (value == null) return 30000; // Default 30 seconds
      const timeout = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(timeout) || timeout < 1000) return 30000; // Minimum 1 second
      return Math.min(timeout, 300000); // Maximum 5 minutes
    });
  }

  /**
   * Transform preview prompts array
   */
  static PreviewPromptsTransform() {
    return Transform(({ value }) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [value];
        }
      }
      return [];
    });
  }
}

export class AgentTemplateEntity implements AgentTemplateModel {
  [key: string]: unknown;

  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  slug!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  // Core AgentNodeParameters fields
  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  model!: string;

  @Expose()
  @IsOptional()
  @AgentTemplateTransformers.TemperatureTransform()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @Expose()
  @IsOptional()
  @AgentTemplateTransformers.MaxTokensTransform()
  @IsNumber()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  @Expose()
  @AgentTemplateTransformers.TimeoutTransform()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeout!: number;

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  memory!: any; // AgentMemoryState - keeping flexible for now

  @Expose()
  @Transformers.JsonTransform()
  @IsObject()
  blueprint!: any; // Blueprint - keeping flexible for now

  // Template metadata
  @Expose()
  @IsEnum(['general', 'coding', 'creative', 'analysis', 'support'])
  category!: 'general' | 'coding' | 'creative' | 'analysis' | 'support';

  @Expose()
  @AgentTemplateTransformers.UsageCountTransform()
  @IsNumber()
  @Min(0)
  usageCount!: number;

  // Template preview
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 10)
  icon?: string;

  @Expose()
  @IsOptional()
  @AgentTemplateTransformers.PreviewPromptsTransform()
  previewPrompts?: string[];

  /**
   * Static factory method for creating AgentTemplateEntity from raw data
   */
  static deserialize(data: Record<string, any>): AgentTemplateEntity {
    return plainToInstance(AgentTemplateEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance method for converting entity to plain object for storage
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Validation method for different contexts
   */
  static async validate(data: any, context: 'create' | 'update' = 'create'): Promise<void> {
    const entity = AgentTemplateEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for agent template creation');
      }
      if (!entity.slug) {
        throw new Error('Slug is required for agent template creation');
      }
      if (!entity.model) {
        throw new Error('Model is required for agent template creation');
      }
      if (!entity.category) {
        throw new Error('Category is required for agent template creation');
      }
    }

    // Business rule validations
    if (entity.name && entity.name.length > 100) {
      throw new Error('Agent template name cannot exceed 100 characters');
    }

    if (entity.slug && entity.slug.length > 100) {
      throw new Error('Agent template slug cannot exceed 100 characters');
    }

    if (entity.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.slug)) {
      throw new Error('Agent template slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (entity.description && entity.description.length > 500) {
      throw new Error('Agent template description cannot exceed 500 characters');
    }

    if (entity.temperature !== undefined && (entity.temperature < 0 || entity.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }

    if (entity.maxTokens !== undefined && (entity.maxTokens < 1 || entity.maxTokens > 100000)) {
      throw new Error('Max tokens must be between 1 and 100,000');
    }

    if (entity.timeout < 1000 || entity.timeout > 300000) {
      throw new Error('Timeout must be between 1,000ms (1s) and 300,000ms (5m)');
    }

    // Validate blueprint structure if provided
    if (entity.blueprint) {
      console.log('[AgentTemplateEntity] Blueprint validation - type:', typeof entity.blueprint);
      console.log(
        '[AgentTemplateEntity] Blueprint validation - keys:',
        entity.blueprint && typeof entity.blueprint === 'object' ? Object.keys(entity.blueprint) : 'N/A'
      );

      // Handle case where blueprint might be a JSON string that needs parsing
      let blueprintObj = entity.blueprint;
      if (typeof entity.blueprint === 'string') {
        try {
          blueprintObj = JSON.parse(entity.blueprint);
        } catch (error) {
          throw new Error('Blueprint must be a valid JSON object');
        }
      }

      if (typeof blueprintObj === 'object' && blueprintObj !== null) {
        console.log('[AgentTemplateEntity] Blueprint object keys:', Object.keys(blueprintObj));
        console.log('[AgentTemplateEntity] Has nodes?', 'nodes' in blueprintObj);
        console.log('[AgentTemplateEntity] Nodes is array?', Array.isArray(blueprintObj.nodes));

        if (!blueprintObj.nodes || !Array.isArray(blueprintObj.nodes)) {
          throw new Error('Blueprint must have a nodes array');
        }
        if (!blueprintObj.edges || !Array.isArray(blueprintObj.edges)) {
          throw new Error('Blueprint must have an edges array');
        }
      }
    }

    // Validate memory structure if provided
    if (entity.memory && typeof entity.memory === 'object') {
      if (entity.memory.identity && typeof entity.memory.identity !== 'object') {
        throw new Error('Memory identity must be an object');
      }
    }

    // Validate preview prompts
    if (entity.previewPrompts && entity.previewPrompts.length > 10) {
      throw new Error('Preview prompts cannot exceed 10 items');
    }
  }

  /**
   * Helper method to check if template is public
   */
  isPublicTemplate(): boolean {
    // Templates don't have isPublic field, they're generally all public
    return true;
  }

  /**
   * Helper method to check if template has been used
   */
  hasBeenUsed(): boolean {
    return this.usageCount > 0;
  }

  /**
   * Helper method to get template age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if template has custom blueprint
   */
  hasCustomBlueprint(): boolean {
    return !!this.blueprint && typeof this.blueprint === 'object';
  }

  /**
   * Helper method to check if template has custom memory configuration
   */
  hasCustomMemory(): boolean {
    return !!this.memory && typeof this.memory === 'object';
  }

  /**
   * Helper method to get template category display name
   */
  getCategoryDisplayName(): string {
    const categoryMap = {
      general: 'General Assistant',
      coding: 'Code Assistant',
      creative: 'Creative Assistant',
      analysis: 'Analysis Assistant',
      support: 'Support Assistant',
    };
    return categoryMap[this.category] || 'Unknown Category';
  }

  /**
   * Helper method to get template usage level
   */
  getUsageLevel(): 'new' | 'light' | 'moderate' | 'heavy' {
    if (this.usageCount === 0) return 'new';
    if (this.usageCount < 10) return 'light';
    if (this.usageCount < 100) return 'moderate';
    return 'heavy';
  }

  /**
   * Helper method to check if template needs attention (old or unused)
   */
  needsAttention(): boolean {
    const daysSinceCreation = this.getAge() / (1000 * 60 * 60 * 24);
    const daysSinceLastUpdate = (Date.now() - new Date(this.updatedAt).getTime()) / (1000 * 60 * 60 * 24);

    // Needs attention if:
    // - Created more than 30 days ago but never used
    // - Not updated in 90 days and has low usage
    return (daysSinceCreation > 30 && this.usageCount === 0) || (daysSinceLastUpdate > 90 && this.usageCount < 5);
  }

  /**
   * Helper method to get model provider
   */
  getModelProvider(): string {
    const model = this.model.toLowerCase();
    if (model.includes('gpt') || model.includes('openai')) return 'OpenAI';
    if (model.includes('claude') || model.includes('anthropic')) return 'Anthropic';
    if (model.includes('gemini') || model.includes('google')) return 'Google';
    if (model.includes('llama') || model.includes('meta')) return 'Meta';
    return 'Unknown';
  }

  /**
   * Helper method to estimate cost per request (rough estimation)
   */
  getEstimatedCostPerRequest(): number {
    const tokens = this.maxTokens || 2000;
    const model = this.model.toLowerCase();

    // Rough cost estimation per 1000 tokens (in USD)
    let costPer1k = 0.002; // Default

    if (model.includes('gpt-4')) costPer1k = 0.03;
    else if (model.includes('gpt-3.5')) costPer1k = 0.002;
    else if (model.includes('claude')) costPer1k = 0.008;
    else if (model.includes('gemini')) costPer1k = 0.001;

    return (tokens / 1000) * costPer1k;
  }

  /**
   * Helper method to check if template has preview content
   */
  hasPreviewContent(): boolean {
    return !!(this.previewPrompts && this.previewPrompts.length > 0);
  }

  /**
   * Helper method to get safe preview prompts (max 3 for display)
   */
  getPreviewPrompts(max: number = 3): string[] {
    if (!this.previewPrompts) return [];
    return this.previewPrompts.slice(0, max);
  }
}
