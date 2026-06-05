/**
 * Agent Entity - Layer 2
 *
 * Bridges database records and the slim agent-registry domain model.
 * An agent is a registry entry for an external agent runtime, not an
 * in-house execution config.
 */

import type { AgentModel, AgentKind, AgentAccessRole } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

const AGENT_KINDS: AgentKind[] = ['claude-code', 'codex', 'hermes', 'openclaw', 'custom'];
const AGENT_ACCESS_ROLES: AgentAccessRole[] = ['viewer', 'contributor'];

export class AgentEntity implements AgentModel {
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
  @IsString()
  @IsIn(AGENT_KINDS)
  kind!: AgentKind;

  @Expose()
  @IsString()
  @IsIn(AGENT_ACCESS_ROLES)
  accessRole!: AgentAccessRole;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  createdByUserId?: string;

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
    const entity = new AgentEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: (dataRecord.starshipId as string) || '',
        slug: (dataRecord.slug as string) || 'agent',
        name: dataRecord.name || '',
        kind: (dataRecord.kind as AgentKind) || 'custom',
        accessRole: (dataRecord.accessRole as AgentAccessRole) || 'contributor',
        description: dataRecord.description,
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
