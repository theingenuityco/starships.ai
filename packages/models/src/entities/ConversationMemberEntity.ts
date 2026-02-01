/**
 * Conversation Member Entity - Layer 2
 *
 * Represents a user's membership in a conversation (used for private channels / ACLs).
 */

import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export type ConversationMemberRole = 'member' | 'admin';

export interface ConversationMemberModel {
  conversationId: string;
  userId: string;
  role: ConversationMemberRole;
  createdAt: string;
  createdBy?: string | null;
}

export class ConversationMemberEntity implements ConversationMemberModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsEnum(['member', 'admin'])
  role!: ConversationMemberRole;

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
    const entity = new ConversationMemberEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        conversationId: dataRecord.conversationId || '',
        userId: dataRecord.userId || '',
        role: (dataRecord.role as ConversationMemberRole) || 'member',
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
