/**
 * Message Entity - Layer 2
 *
 * Bridges between database records and domain models with validation and transformation capabilities.
 * Follows the layered architecture pattern established by ConversationEntity.
 */

import { Transformers } from '@/helpers/serializer';
import type { MessageModel, MessageType } from '@starships/protocol';
import type { LlmToolCall } from '@starships/autopilot';
import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsString, Length, validate, ValidationError, IsOptional, ValidateIf } from 'class-validator';

export class MessageEntity implements MessageModel {
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
  @IsEnum(['system', 'user', 'assistant', 'tool'])
  role!: 'system' | 'user' | 'assistant' | 'tool';

  @Expose()
  @IsString()
  @ValidateIf((o) => !(o.role === 'assistant' && Array.isArray(o.tool_calls) && o.tool_calls.length > 0))
  @Length(1, 50000) // Reasonable content length limit; allow empty when assistant has tool_calls
  content!: string;

  // Message classification
  @Expose()
  @IsEnum(['user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error', 'tool_result'])
  messageType!: MessageType;

  // Optional tool_calls persisted for assistant messages when function calling is used (autopilot types)
  @Expose()
  @IsOptional()
  @Transformers.JsonTransform()
  tool_calls?: LlmToolCall[];

  // Optional tool_call_id for tool result messages - references the tool call that generated this result
  @Expose()
  @IsOptional()
  @IsString()
  tool_call_id?: string;

  /**
   * Simple validation function using class-validator
   * This replaces the manual validation approach with a decorator-based solution
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new MessageEntity();

    // For create operations, validate all required fields
    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id', // Will be replaced by auto-generated ID
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        role: dataRecord.role, // Don't provide defaults during validation
        content: dataRecord.content, // Don't provide defaults during validation
        messageType: dataRecord.messageType, // Don't provide defaults during validation
        ...dataRecord,
      });
    } else {
      // For update operations, only validate provided fields
      Object.assign(entity, dataRecord);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const errorMessages = errors.map((error: ValidationError) => Object.values(error.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }
}
