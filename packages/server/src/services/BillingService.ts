import { LedgerRepository, UsageRepository, WalletRepository, getConnection } from '@starships/models';
import type { UsageModel } from '@starships/protocol';

interface ErrorWithCode extends Error {
  code?: string;
}

export class InsufficientFundsError extends Error implements ErrorWithCode {
  code?: string;
  constructor(message = 'INSUFFICIENT_FUNDS') {
    super(message);
    this.name = 'InsufficientFundsError';
    this.code = 'INSUFFICIENT_FUNDS';
  }
}

export class BillingService {
  private walletRepo: WalletRepository;
  private ledgerRepo: LedgerRepository;
  private usageRepo: UsageRepository;

  constructor() {
    this.walletRepo = new WalletRepository();
    this.ledgerRepo = new LedgerRepository();
    this.usageRepo = new UsageRepository();
  }

  /**
   * Debit a starship wallet for a specific usage row in an atomic, idempotent transaction.
   * Idempotency is enforced by a unique partial index on (wallet_id, meta->>'usageId') for USAGE entries.
   *
   * Behavior:
   * - If cost <= 0, marks usage billed without creating a ledger entry.
   * - If a matching USAGE ledger already exists (idempotent repeat), ensures usage is marked billed and returns.
   * - If wallet has insufficient funds, throws InsufficientFundsError; no ledger is written and usage remains unbilled.
   */
  async debitUsage(usage: UsageModel): Promise<{ billed: boolean; ledgerId: string | null }> {
    const amountStr = this.toFixedUsd(Math.max(0, Number(usage.cost) || 0));
    if (amountStr === '0.000000') {
      // Zero charge: mark as billed without ledger
      const conn = getConnection();
      await conn.transaction(async (client) => {
        await this.usageRepo.markBilledWithClient(client, usage.id, null, new Date().toISOString());
      });
      return { billed: true, ledgerId: null };
    }

    const connection = getConnection();

    return connection.transaction(async (client) => {
      // 1) Locate and lock the wallet row by starship_id
      const walletRes = await client.query<{ id: string }>('SELECT id FROM wallets WHERE starship_id = $1 FOR UPDATE', [usage.starshipId]);
      const walletRow = walletRes.rows[0] ?? null;

      if (!walletRow) {
        const err: ErrorWithCode = new Error('WALLET_NOT_FOUND');
        err.code = 'WALLET_NOT_FOUND';
        throw err;
      }

      const walletId = walletRow.id;

      // 2) Idempotency short-circuit: check existing USAGE ledger with meta.usageId
      const existingRes = await client.query<{ id: string }>(
        `SELECT id
           FROM ledger_entries
          WHERE wallet_id = $1
            AND type = 'USAGE'
            AND (meta ->> 'usageId') = $2
          LIMIT 1`,
        [walletId, usage.id]
      );
      const existing = existingRes.rows[0] ?? null;

      if (existing) {
        // Ensure usage is marked billed if it wasn't yet
        await this.usageRepo.markBilledWithClient(client, usage.id, existing.id, new Date().toISOString());
        return { billed: true, ledgerId: existing.id };
      }

      // 3) Guarded decrement (no overdraft). Throws INSUFFICIENT_FUNDS on failure.
      let newBalance: { balance: string };
      try {
        newBalance = await this.walletRepo.decrementBalanceReturningWithClient(client, walletId, amountStr);
      } catch (e) {
        const err = e as ErrorWithCode;
        if (err?.code === 'INSUFFICIENT_FUNDS' || err?.message === 'INSUFFICIENT_FUNDS') {
          throw new InsufficientFundsError();
        }
        throw e;
      }

      // 4) Insert immutable ledger entry with negative amount
      const ledger = await this.ledgerRepo.createWithClient(client, {
        walletId,
        type: 'USAGE',
        amount: this.negate(amountStr),
        balanceAfter: newBalance.balance,
        meta: {
          usageId: usage.id,
          conversationId: usage.conversationId,
          starshipId: usage.starshipId,
          model: usage.model ?? null,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          provider: 'openrouter',
          // created_at of usage for reconciliation
          usageCreatedAt: usage.createdAt,
        },
      });

      // 5) Link usage <-> ledger and mark billed
      await this.usageRepo.markBilledWithClient(client, usage.id, ledger.id, new Date().toISOString());

      return { billed: true, ledgerId: ledger.id };
    });
  }

  private toFixedUsd(n: number): string {
    return n.toFixed(6);
  }

  private negate(amount: string): string {
    // Normalize to positive then prepend '-'
    const v = Math.abs(Number(amount)).toFixed(6);
    return `-${v}`;
  }
}

export default BillingService;
