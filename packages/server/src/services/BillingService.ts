import { LedgerRepository, UsageRepository, WalletRepository, getConnection } from '@starships/models';
import type { UsageModel } from '@starships/protocol';
import { CREDITS_PER_USER_MESSAGE, toCreditsString } from '@/config/credits';

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
   * Debit a wallet for a user message at a fixed credit cost.
   *
   * Idempotency is enforced by querying ledger_entries where:
   * - wallet_id = walletId
   * - type = 'USAGE'
   * - meta->>'messageId' = messageId
   *
   * A DB-level unique index for this idempotency is added in a later migration.
   */
  async debitForUserMessage(params: {
    walletId: string;
    starshipId: string;
    conversationId: string;
    messageId: string;
    creditsPerMessage?: number;
  }): Promise<{ billed: boolean; ledgerId: string }> {
    const credits = Math.max(0, Number(params.creditsPerMessage ?? CREDITS_PER_USER_MESSAGE) || 0);
    const amountStr = toCreditsString(credits);

    if (!params.walletId?.trim()) throw new Error('WALLET_ID_REQUIRED');
    if (!params.starshipId?.trim()) throw new Error('STARSHIP_ID_REQUIRED');
    if (!params.conversationId?.trim()) throw new Error('CONVERSATION_ID_REQUIRED');
    if (!params.messageId?.trim()) throw new Error('MESSAGE_ID_REQUIRED');
    if (amountStr === '0.000000') {
      // Free tier message cost can be configured by setting creditsPerMessage=0
      return { billed: true, ledgerId: '0' };
    }

    const connection = getConnection();
    return connection.transaction(async (client) => {
      // Lock wallet row
      const walletRes = await client.query<{ id: string }>('SELECT id FROM wallets WHERE id = $1 FOR UPDATE', [params.walletId]);
      const walletRow = walletRes.rows[0] ?? null;
      if (!walletRow) {
        const err: ErrorWithCode = new Error('WALLET_NOT_FOUND');
        err.code = 'WALLET_NOT_FOUND';
        throw err;
      }

      // Idempotency: check if we've already billed this message
      const existingRes = await client.query<{ id: string }>(
        `SELECT id
           FROM wallet_ledger
          WHERE wallet_id = $1
            AND type = 'USAGE'
            AND (meta ->> 'messageId') = $2
          LIMIT 1`,
        [params.walletId, params.messageId]
      );
      const existing = existingRes.rows[0] ?? null;
      if (existing) {
        return { billed: true, ledgerId: existing.id };
      }

      // Guarded decrement (no overdraft)
      let newBalance: { balance: string };
      try {
        newBalance = await this.walletRepo.decrementBalanceReturningWithClient(client, params.walletId, amountStr);
      } catch (e) {
        const err = e as ErrorWithCode;
        if (err?.code === 'INSUFFICIENT_FUNDS' || err?.message === 'INSUFFICIENT_FUNDS') {
          throw new InsufficientFundsError();
        }
        throw e;
      }

      // Insert ledger entry (negative amount)
      const ledger = await this.ledgerRepo.createWithClient(client, {
        walletId: params.walletId,
        type: 'USAGE',
        amount: this.negate(amountStr),
        balanceAfter: newBalance.balance,
        meta: {
          source: 'MESSAGE',
          messageId: params.messageId,
          conversationId: params.conversationId,
          starshipId: params.starshipId,
          creditsPerMessage: Number(params.creditsPerMessage ?? CREDITS_PER_USER_MESSAGE),
        },
      });

      return { billed: true, ledgerId: ledger.id };
    });
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
