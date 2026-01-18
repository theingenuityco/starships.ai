/**
 * OnboardingSession Entity - Layer 2
 *
 * Persists onboarding wizard progress for a user.
 */

import type { OnboardingSessionModel, OnboardingStep, OnboardingGoal } from '@starships/protocol';
import { Expose, Transform } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional, IsString, validate, ValidationError, IsIn } from 'class-validator';

const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'goals', 'connectors', 'agents', 'first_task', 'done'];

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      // ignore
    }
  }
  return [];
}

function coerceIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export class OnboardingSessionEntity implements OnboardingSessionModel {
  @Expose()
  @IsString()
  userId!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? null)
  starshipId!: string | null;

  @Expose()
  @IsString()
  @IsIn(ONBOARDING_STEPS)
  step!: OnboardingStep;

  @Expose()
  @IsArray()
  @Transform(({ value }) => coerceStringArray(value))
  goals!: OnboardingGoal[];

  @Expose()
  @IsArray()
  @Transform(({ value }) => coerceStringArray(value))
  selectedConnectorProviders!: string[];

  @Expose()
  @IsArray()
  @Transform(({ value }) => coerceStringArray(value))
  selectedAgentTemplateIds!: string[];

  @Expose()
  @IsOptional()
  @Transform(({ value }) => value ?? null)
  primaryAgentTemplateId?: string | null;

  @Expose()
  @IsOptional()
  @Transform(({ value }) => value ?? null)
  @IsISO8601()
  completedAt?: string | null;

  @Expose()
  @IsISO8601()
  @Transform(({ value }) => coerceIso(value) ?? new Date().toISOString())
  createdAt!: string;

  @Expose()
  @IsISO8601()
  @Transform(({ value }) => coerceIso(value) ?? new Date().toISOString())
  updatedAt!: string;

  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');

    const r = data as Record<string, unknown>;
    const entity = new OnboardingSessionEntity();

    if (operation === 'create') {
      const now = new Date().toISOString();
      Object.assign(entity, {
        userId: r.userId || 'temp-user-id',
        starshipId: (r.starshipId as string | null | undefined) ?? null,
        step: (r.step as OnboardingStep | undefined) ?? 'welcome',
        goals: (Array.isArray(r.goals) ? r.goals : []) as OnboardingGoal[],
        selectedConnectorProviders: (Array.isArray(r.selectedConnectorProviders) ? r.selectedConnectorProviders : []) as string[],
        selectedAgentTemplateIds: (Array.isArray(r.selectedAgentTemplateIds) ? r.selectedAgentTemplateIds : []) as string[],
        primaryAgentTemplateId: (r.primaryAgentTemplateId as string | null | undefined) ?? null,
        completedAt: (r.completedAt as string | null | undefined) ?? null,
        createdAt: (r.createdAt as string | undefined) ?? now,
        updatedAt: (r.updatedAt as string | undefined) ?? now,
        ...r,
      });
    } else {
      Object.assign(entity, r);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const msg = errors.map((e: ValidationError) => Object.values(e.constraints || {}).join(', ')).join('; ');
      throw new Error(`Validation failed: ${msg}`);
    }
  }
}

