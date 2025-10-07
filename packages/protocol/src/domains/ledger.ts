/**
 * Ledger domain models
 * Canonical immutable ledger entry shape for API contracts
 */

export type LedgerEntryType = 'TOPUP' | 'USAGE' | 'REFUND' | 'ADJUSTMENT';

export interface LedgerEntryModel {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  amount: string; // DECIMAL(18,6) as string for precision
  balanceAfter: string; // DECIMAL(18,6) as string
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface LedgerListResponse {
  rows: LedgerEntryModel[];
  nextCursor?: string;
}
