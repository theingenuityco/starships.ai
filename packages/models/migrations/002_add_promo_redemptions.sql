-- ============================================================================
-- PROMO REDEMPTIONS TABLE
-- Description: Tracks per-user redemption of Stripe Dashboard-managed promo codes
-- Scope: Per-user (global across starships); credits are applied to a selected starship wallet
-- ============================================================================

-- Create table to record redemptions
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promo_code VARCHAR(100) NOT NULL,
  stripe_coupon_id VARCHAR(255),
  stripe_promotion_id VARCHAR(255),
  reward_amount DECIMAL(18,6),
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  message TEXT,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case-insensitive uniqueness per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemptions_user_code_ci
  ON promo_redemptions(user_id, lower(promo_code));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user_id ON promo_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_code ON promo_redemptions(promo_code);

COMMENT ON TABLE promo_redemptions IS 'Records when a user redeems a Stripe promo code for wallet credits (per-user scope)';
