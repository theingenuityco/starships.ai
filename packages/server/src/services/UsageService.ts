import { UsageRepository } from '@starships/models';
import type { UsageModel, UsageTotals } from '@starships/protocol';

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

  async getTotalsByConversation(conversationId: string): Promise<UsageTotals> {
    return this.repo.getTotalsByConversation(conversationId);
  }

  async getTotalsByStarship(starshipId: string): Promise<UsageTotals> {
    return this.repo.getTotalsByStarship(starshipId);
  }

  async listByConversation(conversationId: string, options?: { limit?: number; offset?: number }): Promise<UsageModel[]> {
    return this.repo.listByConversation(conversationId, options);
  }
}

export default UsageService;
