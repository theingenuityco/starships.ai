import { BaseRepository } from '@/repositories/BaseRepository';

export type LlmModelRow = {
  model: string;
  displayName?: string | null;
  description?: string | null;
  contextLength?: number | null;
  inputModalities?: string[] | null;
  outputModalities?: string[] | null;
  supportedParameters?: string[] | null;
  metadata?: Record<string, unknown> | null;
  isEnabled: boolean;
  isDeprecated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LlmModelProviderRow = {
  model: string;
  provider: string;
  providerModelId: string;
  priority: number;
  isEnabled: boolean;
  pricing?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export class LlmModelRepository extends BaseRepository {
  constructor() {
    super('LlmModelRepository');
  }

  async listModels(opts: { enabledOnly?: boolean } = {}): Promise<LlmModelRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const enabledOnly = opts.enabledOnly !== false;
        const rows = await conn.query<{
          model: string;
          display_name: string | null;
          description: string | null;
          context_length: number | null;
          input_modalities: string[] | null;
          output_modalities: string[] | null;
          supported_parameters: string[] | null;
          metadata: Record<string, unknown> | null;
          is_enabled: boolean;
          is_deprecated: boolean;
          created_at: string;
          updated_at: string;
        }>(
          `
          SELECT *
          FROM llm_models
          WHERE ($1::boolean = false OR is_enabled = true)
          ORDER BY model ASC
          `,
          [enabledOnly]
        );

        return (rows || []).map((r) => ({
          model: r.model,
          displayName: r.display_name,
          description: r.description,
          contextLength: r.context_length,
          inputModalities: r.input_modalities ?? [],
          outputModalities: r.output_modalities ?? [],
          supportedParameters: r.supported_parameters ?? [],
          metadata: r.metadata ?? {},
          isEnabled: Boolean(r.is_enabled),
          isDeprecated: Boolean(r.is_deprecated),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        }));
      },
      'listModels',
      'LlmModel'
    );
  }

  async listProvidersForModel(model: string, opts: { enabledOnly?: boolean } = {}): Promise<LlmModelProviderRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const m = String(model || '').trim();
        if (!m) throw new Error('model is required');

        const conn = this.getConnection();
        const enabledOnly = opts.enabledOnly !== false;
        const rows = await conn.query<{
          model: string;
          provider: string;
          provider_model_id: string;
          priority: number;
          is_enabled: boolean;
          pricing: Record<string, unknown> | null;
          metadata: Record<string, unknown> | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `
          SELECT *
          FROM llm_model_providers
          WHERE model = $1
            AND ($2::boolean = false OR is_enabled = true)
          ORDER BY priority DESC, provider ASC, provider_model_id ASC
          `,
          [m, enabledOnly]
        );

        return (rows || []).map((r) => ({
          model: r.model,
          provider: r.provider,
          providerModelId: r.provider_model_id,
          priority: Number(r.priority ?? 0),
          isEnabled: Boolean(r.is_enabled),
          pricing: r.pricing ?? null,
          metadata: r.metadata ?? {},
          lastSyncedAt: r.last_synced_at ?? null,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        }));
      },
      'listProvidersForModel',
      'LlmModel',
      model
    );
  }

  /**
   * Upsert canonical models (keyed by `model` string).
   * NOTE: This does not delete missing models; it's safe for incremental syncs.
   */
  async upsertModels(models: Array<Partial<LlmModelRow> & { model: string }>): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const nowIso = new Date().toISOString();

        const queries = (models || [])
          .map((m) => ({
            model: String(m.model || '').trim(),
            displayName: typeof m.displayName === 'string' ? m.displayName : null,
            description: typeof m.description === 'string' ? m.description : null,
            contextLength: typeof m.contextLength === 'number' ? m.contextLength : null,
            inputModalities: Array.isArray(m.inputModalities) ? m.inputModalities.filter((x): x is string => typeof x === 'string') : [],
            outputModalities: Array.isArray(m.outputModalities) ? m.outputModalities.filter((x): x is string => typeof x === 'string') : [],
            supportedParameters: Array.isArray(m.supportedParameters)
              ? m.supportedParameters.filter((x): x is string => typeof x === 'string')
              : [],
            metadata: (m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)) ? (m.metadata as Record<string, unknown>) : {},
            isEnabled: typeof m.isEnabled === 'boolean' ? m.isEnabled : true,
            isDeprecated: typeof m.isDeprecated === 'boolean' ? m.isDeprecated : false,
          }))
          .filter((m) => m.model.length > 0);

        if (queries.length === 0) return;

        await conn.batchQuery(
          queries.map((m) => ({
            text: `
              INSERT INTO llm_models (
                model,
                display_name,
                description,
                context_length,
                input_modalities,
                output_modalities,
                supported_parameters,
                metadata,
                is_enabled,
                is_deprecated,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
              )
              ON CONFLICT (model) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                context_length = EXCLUDED.context_length,
                input_modalities = EXCLUDED.input_modalities,
                output_modalities = EXCLUDED.output_modalities,
                supported_parameters = EXCLUDED.supported_parameters,
                metadata = EXCLUDED.metadata,
                is_enabled = EXCLUDED.is_enabled,
                is_deprecated = EXCLUDED.is_deprecated,
                updated_at = EXCLUDED.updated_at
            `,
            params: [
              m.model,
              m.displayName,
              m.description,
              m.contextLength,
              m.inputModalities,
              m.outputModalities,
              m.supportedParameters,
              m.metadata,
              m.isEnabled,
              m.isDeprecated,
              nowIso,
              nowIso,
            ],
          }))
        );
      },
      'upsertModels',
      'LlmModel'
    );
  }

  /**
   * Upsert provider routes for canonical models (composite key: model, provider, provider_model_id).
   */
  async upsertModelProviders(rows: Array<Partial<LlmModelProviderRow> & { model: string; provider: string; providerModelId: string }>): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const nowIso = new Date().toISOString();

        const normalized = (rows || [])
          .map((r) => ({
            model: String(r.model || '').trim(),
            provider: String(r.provider || '').trim(),
            providerModelId: String(r.providerModelId || '').trim(),
            priority: typeof r.priority === 'number' ? r.priority : 0,
            isEnabled: typeof r.isEnabled === 'boolean' ? r.isEnabled : true,
            pricing: (r.pricing && typeof r.pricing === 'object' && !Array.isArray(r.pricing)) ? (r.pricing as Record<string, unknown>) : null,
            metadata: (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) ? (r.metadata as Record<string, unknown>) : {},
            lastSyncedAt: typeof r.lastSyncedAt === 'string' ? r.lastSyncedAt : null,
          }))
          .filter((r) => r.model.length > 0 && r.provider.length > 0 && r.providerModelId.length > 0);

        if (normalized.length === 0) return;

        await conn.batchQuery(
          normalized.map((r) => ({
            text: `
              INSERT INTO llm_model_providers (
                model,
                provider,
                provider_model_id,
                priority,
                is_enabled,
                pricing,
                metadata,
                last_synced_at,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
              )
              ON CONFLICT (model, provider, provider_model_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_enabled = EXCLUDED.is_enabled,
                pricing = EXCLUDED.pricing,
                metadata = EXCLUDED.metadata,
                last_synced_at = EXCLUDED.last_synced_at,
                updated_at = EXCLUDED.updated_at
            `,
            params: [
              r.model,
              r.provider,
              r.providerModelId,
              r.priority,
              r.isEnabled,
              r.pricing,
              r.metadata,
              r.lastSyncedAt,
              nowIso,
              nowIso,
            ],
          }))
        );
      },
      'upsertModelProviders',
      'LlmModelProvider'
    );
  }
}

