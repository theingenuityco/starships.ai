import { UsageRepository } from '@starships/models';
import type { UsageModel, LLMUsage, DailyUsageRow, DailyModelUsageRow } from '@starships/protocol';

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

  // Starship-based methods (equivalent to user-based but for single starship)
  async getTotalsByStarshipWithCount(starshipId: string): Promise<{ totals: LLMUsage; requestCount: number }> {
    return this.repo.getTotalsByStarshipWithCount(starshipId);
  }

  async listByStarship(
    starshipId: string,
    options?: { limit?: number; offset?: number; day?: string; model?: string; order?: 'ASC' | 'DESC' }
  ): Promise<UsageModel[]> {
    return this.repo.listByStarship(starshipId, options ?? {});
  }

  async countByStarship(starshipId: string, options?: { day?: string; model?: string }): Promise<number> {
    return this.repo.countByStarship(starshipId, options ?? {});
  }

  async listDailyByStarship(
    starshipId: string,
    options?: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' }
  ): Promise<DailyUsageRow[]> {
    return this.repo.listDailyByStarship(starshipId, options ?? {});
  }

  async countDailyByStarship(starshipId: string): Promise<number> {
    return this.repo.countDailyByStarship(starshipId);
  }

  async listDailyModelByStarship(
    starshipId: string,
    options?: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' }
  ): Promise<DailyModelUsageRow[]> {
    return this.repo.listDailyModelByStarship(starshipId, options ?? {});
  }

  async countDailyModelByStarship(starshipId: string): Promise<number> {
    return this.repo.countDailyModelByStarship(starshipId);
  }
}

export default UsageService;
