/**
 * Promo domain models
 * Canonical promo redemption shapes for API contracts
 */

export type PromoRedemptionStatus = 'success' | 'failed';

export interface PromoRedemptionModel {
  id: string;
  userId: string;
  promoCode: string;
  stripeCouponId?: string;
  stripePromotionId?: string;
  rewardAmount?: string; // DECIMAL(18,6) as string
  status: PromoRedemptionStatus;
  message?: string;
  redeemedAt: string;
}

export interface RedeemPromoRequest {
  code: string;
  starshipId: string; // wallet is starship-scoped; user scope enforced server-side
}

export interface RedeemPromoResponse {
  message: string;
  newBalance: string;
}
