/**
 * Conversation Participant Entity - Layer 2
 *
 * Represents a participant (user or agent) in a conversation.
 */

import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export type ConversationParticipantRole = 'member' | 'admin';

export interface ConversationParticipantModel {
  conversationId: string;
  userId?: string | null;
  agentId?: string | null;
  role?: ConversationParticipantRole | null;
  createdAt: string;
  createdBy?: string | null;
}

export class ConversationParticipantEntity implements ConversationParticipantModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  agentId?: string | null;

  @Expose()
  @IsOptional()
  @IsEnum(['member', 'admin'])
  role?: ConversationParticipantRole | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  createdBy?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new ConversationParticipantEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: dataRecord.conversationId || '',
        userId: (dataRecord.userId as string | null | undefined) ?? null,
        agentId: (dataRecord.agentId as string | null | undefined) ?? null,
        role: (dataRecord.role as ConversationParticipantRole | null | undefined) ?? null,
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        createdBy: (dataRecord.createdBy as string | null | undefined) ?? null,
      });
    } else {
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
