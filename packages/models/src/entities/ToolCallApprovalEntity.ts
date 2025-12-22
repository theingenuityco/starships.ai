/**
 * ToolCallApproval Entity - Layer 2
 *
 * Minimal entity for tool approval persistence.
 */

import type { ToolCallApprovalModel } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

export class ToolCallApprovalEntity implements ToolCallApprovalModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  starshipId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  conversationId!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  agentId!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  toolSlug!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  toolCallId!: string;

  @Expose()
  @IsObject()
  argsJson!: Record<string, unknown>;

  @Expose()
  @IsEnum(['pending', 'approved', 'denied', 'expired'])
  status!: 'pending' | 'approved' | 'denied' | 'expired';

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  decidedAt?: string | null;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const rec = data as Record<string, unknown>;
    const entity = new ToolCallApprovalEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: rec.id || 'temp-id',
        starshipId: rec.starshipId || 'temp-starship-id',
        conversationId: rec.conversationId || 'temp-conversation-id',
        agentId: rec.agentId || 'temp-agent-id',
        toolSlug: rec.toolSlug,
        toolCallId: rec.toolCallId,
        argsJson: (rec.argsJson && typeof rec.argsJson === 'object' ? rec.argsJson : {}) as Record<string, unknown>,
        status: rec.status || 'pending',
        createdAt: rec.createdAt || new Date().toISOString(),
        decidedAt: rec.decidedAt ?? null,
      });
    } else {
      Object.assign(entity, rec);
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
