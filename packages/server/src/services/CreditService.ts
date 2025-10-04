/**
 * CreditService
 *
 * Business logic for user credit management
 */

import { CreditRepository } from '@starships/models';

export class CreditService {
  private repo: CreditRepository;

  constructor() {
    this.repo = new CreditRepository();
  }

  /**
   * Get user credit balance
   */
  async getBalance(userId: string): Promise<number> {
    return this.repo.getBalance(userId);
  }

  /**
   * Ensure user has a credit balance row
   */
  async ensureBalanceRow(userId: string): Promise<void> {
    return this.repo.ensureBalanceRow(userId);
  }

  /**
   * Top up user credits via webhook
   */
  async topupViaWebhook(userId: string, amount: number, stripePaymentId: string, description?: string): Promise<void> {
    return this.repo.topup(userId, amount, stripePaymentId, description);
  }

  /**
   * Deduct credits for usage
   */
  async deductForUsage(userId: string, amount: number, usageId: string): Promise<{ ok: boolean; remaining: number }> {
    return this.repo.deductForUsage(userId, amount, usageId);
  }

  /**
   * List credit transactions for a user
   */
  async listTransactions(
    userId: string,
    options: { page?: number; limit?: number; order?: 'ASC' | 'DESC' } = {}
  ): Promise<{ records: any[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;

    return this.repo.listTransactions(userId, { limit, offset, order: options.order });
  }
}

export default CreditService;
