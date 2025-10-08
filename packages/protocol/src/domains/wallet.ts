/**
 * Wallet domain models
 * Canonical wallet shape for API contracts
 */

export type CurrencyCode = 'USD';

export interface WalletModel {
  id: string;
  starshipId: string;
  currency: CurrencyCode;
  balance: string; // Use string to preserve DECIMAL(18,6) precision
  createdAt: string;
  updatedAt: string;
}

export interface WalletResponse {
  wallet: WalletModel;
}
