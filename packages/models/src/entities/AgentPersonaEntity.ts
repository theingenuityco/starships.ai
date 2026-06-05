/**
 * AgentPersona Entity - Layer 2
 *
 * Bridges database records and the agent-persona domain model. A persona is the
 * user-authored actor: identity, workspace access, and behaviour (system prompt,
 * model) injected into the runtime it is assigned to.
 */

import type { AgentPersonaModel, AgentAccessRole } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsNumber, IsOptional, IsString, Length, Max, Min, validate, ValidationError } from 'class-validator';

const AGENT_ACCESS_ROLES: AgentAccessRole[] = ['viewer', 'contributor'];

export class AgentPersonaEntity implements AgentPersonaModel {
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
  @Length(1, 100)
  slug!: string;

  @Expose()
  @IsString()
  @Length(1, 100)
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 1024)
  avatarUrl?: string | null;

  @Expose()
  @IsString()
  @IsIn(AGENT_ACCESS_ROLES)
  accessRole!: AgentAccessRole;

  @Expose()
  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 100)
  model?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  instructions?: string | null;

  @Expose()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  runtimeId?: string | null;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  createdByUserId?: string | null;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }
    const dataRecord = data as Record<string, unknown>;
    const entity = new AgentPersonaEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: (dataRecord.starshipId as string) || '',
        slug: (dataRecord.slug as string) || 'persona',
        name: dataRecord.name || '',
        description: dataRecord.description,
        avatarUrl: dataRecord.avatarUrl,
        accessRole: (dataRecord.accessRole as AgentAccessRole) || 'contributor',
        systemPrompt: dataRecord.systemPrompt,
        model: dataRecord.model,
        instructions: dataRecord.instructions,
        temperature: dataRecord.temperature,
        runtimeId: dataRecord.runtimeId,
        createdByUserId: dataRecord.createdByUserId,
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
