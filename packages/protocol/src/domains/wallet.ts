/**
 * Wallet domain models
 * Canonical wallet shape for API contracts
 */

// Transitional: allow existing USD wallets until DB migration converts to CREDITS
export type CurrencyCode = 'USD' | 'CREDITS';

export interface WalletModel {
  id: string;
  starshipId: string;
  currency: CurrencyCode;
  balance: string; // Use string to preserve DECIMAL(18,6) precision (interpreted as credits after migration)
  createdAt: string;
  updatedAt: string;
}

export interface WalletResponse {
  wallet: WalletModel;
}
