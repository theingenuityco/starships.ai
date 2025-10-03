import { UsageRepository } from '@starships/models';
import type { UsageModel, LLMUsage, UserUsageTotals, DailyUsageRow, DailyModelUsageRow } from '@starships/protocol';

export interface CreateUsageForTurnParams {
  starshipId: string;
  conversationId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  model?: string;
}

/**
 * UsageService
 * Thin service layer over UsageRepository for creating per-turn usage records
 * and fetching aggregate totals for conversations and starships.
 */
export class UsageService {
  private repo: UsageRepository;

  constructor() {
    this.repo = new UsageRepository();
  }

  async createUsageForTurn(params: CreateUsageForTurnParams): Promise<UsageModel> {
    const { starshipId, conversationId, promptTokens, completionTokens, totalTokens, cost, model } = params;

    return this.repo.createAndLink({
      starshipId,
      conversationId,
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
      model,
    });
  }

  async getTotalsByConversation(conversationId: string): Promise<LLMUsage> {
    return this.repo.getTotalsByConversation(conversationId);
  }

  async getTotalsByStarship(starshipId: string): Promise<LLMUsage> {
    return this.repo.getTotalsByStarship(starshipId);
  }

  async listByConversation(conversationId: string, options?: { limit?: number; offset?: number }): Promise<UsageModel[]> {
    return this.repo.listByConversation(conversationId, options);
  }

  // Aggregate totals across all starships owned by a user
  async getTotalsByUser(userId: string): Promise<UserUsageTotals> {
    return this.repo.getTotalsByUser(userId);
  }

  // List usage records across all starships owned by a user (paginated + filters)
  async listByUser(
    userId: string,
    options?: { limit?: number; offset?: number; day?: string; model?: string; order?: 'ASC' | 'DESC' }
  ): Promise<UsageModel[]> {
    return this.repo.listByUser(userId, options ?? {});
  }

  // Count usage records for a user with optional filters (for pagination totals)
  async countByUser(userId: string, options?: { day?: string; model?: string }): Promise<number> {
    return this.repo.countByUser(userId, options ?? {});
  }

  // Daily aggregates (Day)
  async listDailyByUser(userId: string, options?: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' }): Promise<DailyUsageRow[]> {
    return this.repo.listDailyByUser(userId, options ?? {});
  }

  async countDailyByUser(userId: string): Promise<number> {
    return this.repo.countDailyByUser(userId);
  }

  // Daily+Model aggregates (Day + Model)
  async listDailyModelByUser(
    userId: string,
    options?: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' }
  ): Promise<DailyModelUsageRow[]> {
    return this.repo.listDailyModelByUser(userId, options ?? {});
  }

  async countDailyModelByUser(userId: string): Promise<number> {
    return this.repo.countDailyModelByUser(userId);
  }
}

export default UsageService;
