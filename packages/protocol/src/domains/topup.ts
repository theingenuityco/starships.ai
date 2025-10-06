/**
 * Topup domain models
 * Canonical topup shape for API contracts
 */

export type TopupStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface TopupModel {
  id: string;
  walletId: string;
  amountUsd: string; // Use string to preserve DECIMAL precision
  status: TopupStatus;
  stripeSessionId?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTopupRequest {
  amountUsd: number;
  walletId: string;
}

export interface CreateTopupResponse {
  checkoutUrl: string;
}

export interface TopupResponse {
  topup: TopupModel;
}
