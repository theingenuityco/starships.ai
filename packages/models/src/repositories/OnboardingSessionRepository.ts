import { OnboardingSessionEntity } from '@/entities/OnboardingSessionEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { OnboardingSessionModel, OnboardingGoal, OnboardingStep } from '@starships/protocol';

function normalizeIsoString(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
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

export class OnboardingSessionRepository extends BaseRepository {
  constructor() {
    super('OnboardingSessionRepository');
  }

  async findByUserId(userId: string): Promise<OnboardingSessionModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(`SELECT * FROM onboarding_sessions WHERE user_id = $1`, [userId]);
        return row ? (fromDatabase(OnboardingSessionEntity, row) as unknown as OnboardingSessionModel) : null;
      },
      'findByUserId',
      'OnboardingSession',
      userId
    );
  }

  async upsertForUser(userId: string, data: Partial<OnboardingSessionModel>): Promise<OnboardingSessionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const payload: OnboardingSessionModel = {
          userId,
          starshipId: (data.starshipId ?? null) as string | null,
          step: (data.step ?? 'welcome') as OnboardingStep,
          goals: normalizeStringArray(data.goals) as OnboardingGoal[],
          selectedConnectorProviders: normalizeStringArray(data.selectedConnectorProviders),
          selectedAgentTemplateIds: normalizeStringArray(data.selectedAgentTemplateIds),
          primaryAgentTemplateId: (data.primaryAgentTemplateId ?? null) as string | null,
          completedAt: data.completedAt ? normalizeIsoString(data.completedAt, now) : null,
          createdAt: normalizeIsoString(data.createdAt, now),
          updatedAt: now,
        };

        await OnboardingSessionEntity.validate(payload, 'create');

        // Convert to DB format (camelCase → snake_case)
        // `toEntityInstance` expects a plain record shape.
        const entity = toEntityInstance(OnboardingSessionEntity, payload as unknown as Record<string, unknown>);
        const db = toDatabase(entity);

        // IMPORTANT: node-postgres serializes JS arrays as Postgres array literals (`{"x"}`),
        // which are invalid JSON for json/jsonb columns. Force JSON strings + cast in SQL.
        const goalsJson = JSON.stringify(db.goals ?? []);
        const selectedConnectorProvidersJson = JSON.stringify(db.selected_connector_providers ?? []);
        const selectedAgentTemplateIdsJson = JSON.stringify(db.selected_agent_template_ids ?? []);

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `
          INSERT INTO onboarding_sessions (
            user_id, starship_id, step, goals, selected_connector_providers, selected_agent_template_ids,
            primary_agent_template_id, completed_at, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
          ON CONFLICT (user_id) DO UPDATE SET
            starship_id = EXCLUDED.starship_id,
            step = EXCLUDED.step,
            goals = EXCLUDED.goals,
            selected_connector_providers = EXCLUDED.selected_connector_providers,
            selected_agent_template_ids = EXCLUDED.selected_agent_template_ids,
            primary_agent_template_id = EXCLUDED.primary_agent_template_id,
            completed_at = EXCLUDED.completed_at,
            updated_at = EXCLUDED.updated_at
          RETURNING *
          `,
          [
            db.user_id,
            db.starship_id,
            db.step,
            goalsJson,
            selectedConnectorProvidersJson,
            selectedAgentTemplateIdsJson,
            db.primary_agent_template_id,
            db.completed_at,
            db.created_at,
            db.updated_at,
          ]
        );

        if (!result) {
          throw new Error('Failed to upsert onboarding session');
        }
        return fromDatabase(OnboardingSessionEntity, result) as unknown as OnboardingSessionModel;
      },
      'upsertForUser',
      'OnboardingSession',
      userId
    );
  }

  /**
   * Ensure an onboarding session exists for a user without overwriting any existing session state.
   *
   * This avoids a check-then-insert race and prevents accidentally resetting step/goals when the
   * session already exists.
   */
  async ensureForUser(userId: string): Promise<OnboardingSessionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const payload: OnboardingSessionModel = {
          userId,
          starshipId: null,
          step: 'welcome',
          goals: [],
          selectedConnectorProviders: [],
          selectedAgentTemplateIds: [],
          primaryAgentTemplateId: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        await OnboardingSessionEntity.validate(payload, 'create');

        const entity = toEntityInstance(OnboardingSessionEntity, payload as unknown as Record<string, unknown>);
        const db = toDatabase(entity);

        const goalsJson = JSON.stringify(db.goals ?? []);
        const selectedConnectorProvidersJson = JSON.stringify(db.selected_connector_providers ?? []);
        const selectedAgentTemplateIdsJson = JSON.stringify(db.selected_agent_template_ids ?? []);

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `
          INSERT INTO onboarding_sessions (
            user_id, starship_id, step, goals, selected_connector_providers, selected_agent_template_ids,
            primary_agent_template_id, completed_at, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
          ON CONFLICT (user_id) DO UPDATE SET
            updated_at = EXCLUDED.updated_at
          RETURNING *
          `,
          [
            db.user_id,
            db.starship_id,
            db.step,
            goalsJson,
            selectedConnectorProvidersJson,
            selectedAgentTemplateIdsJson,
            db.primary_agent_template_id,
            db.completed_at,
            db.created_at,
            db.updated_at,
          ]
        );

        if (!result) throw new Error('Failed to ensure onboarding session');
        return fromDatabase(OnboardingSessionEntity, result) as unknown as OnboardingSessionModel;
      },
      'ensureForUser',
      'OnboardingSession',
      userId
    );
  }
}

