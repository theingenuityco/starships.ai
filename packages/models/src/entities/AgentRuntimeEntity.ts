/**
 * AgentRuntime Entity - Layer 2
 *
 * Bridges database records and the agent-runtime domain model. A runtime is a
 * registry entry for an external agent engine (Claude Code, Codex, ...). Identity
 * and behaviour live on the persona, not here.
 */

import type { AgentRuntimeModel, AgentRuntimeKind } from '@starships/protocol';
import { Expose } from 'class-transformer';
import { IsISO8601, IsIn, IsOptional, IsString, Length, validate, ValidationError } from 'class-validator';

const AGENT_RUNTIME_KINDS: AgentRuntimeKind[] = ['claude-code', 'codex', 'hermes', 'openclaw', 'custom'];

export class AgentRuntimeEntity implements AgentRuntimeModel {
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
  @IsIn(AGENT_RUNTIME_KINDS)
  kind!: AgentRuntimeKind;

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
    const entity = new AgentRuntimeEntity();

    if (operation === 'create') {
      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || new Date().toISOString(),
        updatedAt: dataRecord.updatedAt || new Date().toISOString(),
        starshipId: (dataRecord.starshipId as string) || '',
        slug: (dataRecord.slug as string) || 'runtime',
        name: dataRecord.name || '',
        kind: (dataRecord.kind as AgentRuntimeKind) || 'custom',
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
