/**
 * Agent Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity and MessageEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { AgentModel } from '@starships/protocol';
import { Expose, instanceToPlain, plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/**
 * Custom transformers for the AgentEntity
 */
export class AgentTransformers {
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
}

export class AgentEntity implements AgentModel {
  [key: string]: unknown;
  // Core database fields
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  @Expose()
  @IsString()
  @Length(1, 20)
  version!: string;

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
  @AgentTransformers.TemperatureTransform()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @Expose()
  @IsOptional()
  @AgentTransformers.MaxTokensTransform()
  @IsNumber()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  @Expose()
  @AgentTransformers.TimeoutTransform()
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

  // Marketplace fields
  @Expose()
  @IsEnum(['general', 'coding', 'creative', 'analysis', 'support'])
  category!: 'general' | 'coding' | 'creative' | 'analysis' | 'support';

  @Expose()
  @AgentTransformers.UsageCountTransform()
  @IsNumber()
  @Min(0)
  usageCount!: number;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  authorId?: string;

  // Template relationship
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  templateId?: string;

  // Deployment settings
  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  /**
   * Static factory method for creating AgentEntity from raw data
   */
  static deserialize(data: Record<string, any>): AgentEntity {
    return plainToInstance(AgentEntity, data, {
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
    const entity = AgentEntity.deserialize(data);

    // Context-specific validation rules
    if (context === 'create') {
      // For creation, certain fields are required
      if (!entity.name) {
        throw new Error('Name is required for agent creation');
      }
      if (!entity.model) {
        throw new Error('Model is required for agent creation');
      }
      if (!entity.starshipId) {
        throw new Error('Starship ID is required for agent creation');
      }
      if (!entity.category) {
        throw new Error('Category is required for agent creation');
      }
    }

    // Business rule validations
    if (entity.name && entity.name.length > 100) {
      throw new Error('Agent name cannot exceed 100 characters');
    }

    if (entity.description && entity.description.length > 500) {
      throw new Error('Agent description cannot exceed 500 characters');
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
    if (entity.blueprint && typeof entity.blueprint === 'object') {
      if (!entity.blueprint.nodes || !Array.isArray(entity.blueprint.nodes)) {
        throw new Error('Blueprint must have a nodes array');
      }
      if (!entity.blueprint.edges || !Array.isArray(entity.blueprint.edges)) {
        throw new Error('Blueprint must have an edges array');
      }
    }

    // Validate memory structure if provided
    if (entity.memory && typeof entity.memory === 'object') {
      if (entity.memory.identity && typeof entity.memory.identity !== 'object') {
        throw new Error('Memory identity must be an object');
      }
    }
  }

  /**
   * Helper method to check if agent is public
   */
  isPublicAgent(): boolean {
    return this.isPublic === true;
  }

  /**
   * Helper method to check if agent has a template
   */
  isFromTemplate(): boolean {
    return !!this.templateId;
  }

  /**
   * Helper method to check if agent has been used
   */
  hasBeenUsed(): boolean {
    return this.usageCount > 0;
  }

  /**
   * Helper method to check if agent is deployed to a starship
   */
  isDeployed(): boolean {
    return !!this.starshipId;
  }

  /**
   * Helper method to get agent age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.createdAt).getTime();
  }

  /**
   * Helper method to check if agent has custom blueprint
   */
  hasCustomBlueprint(): boolean {
    return !!this.blueprint && typeof this.blueprint === 'object';
  }

  /**
   * Helper method to check if agent has custom memory configuration
   */
  hasCustomMemory(): boolean {
    return !!this.memory && typeof this.memory === 'object';
  }

  /**
   * Helper method to get agent category display name
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
   * Helper method to get agent usage level
   */
  getUsageLevel(): 'new' | 'light' | 'moderate' | 'heavy' {
    if (this.usageCount === 0) return 'new';
    if (this.usageCount < 10) return 'light';
    if (this.usageCount < 100) return 'moderate';
    return 'heavy';
  }

  /**
   * Helper method to check if agent needs attention (old or unused)
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
}
