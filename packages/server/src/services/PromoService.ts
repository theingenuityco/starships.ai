import Stripe from 'stripe';
import { LedgerRepository, PromoRedemptionRepository, WalletRepository, getConnection } from '@starships/models';
import { StarshipService } from '@/services/StarshipService';
import type { RedeemPromoRequest, RedeemPromoResponse } from '@starships/protocol';

export class PromoService {
  private stripe: Stripe;
  private walletRepo: WalletRepository;
  private ledgerRepo: LedgerRepository;
  private redemptionRepo: PromoRedemptionRepository;
  private starshipService: StarshipService;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2025-12-15.clover',
    });
    this.walletRepo = new WalletRepository();
    this.ledgerRepo = new LedgerRepository();
    this.redemptionRepo = new PromoRedemptionRepository();
    this.starshipService = new StarshipService();
  }

  /**
   * Redeem a Stripe Dashboard-managed promo code for wallet credits.
   * - Scope: per-user (one redemption per user per code), wallet is starship scoped
   * - Supports only fixed USD amount_off coupons
   */
  async redeem(userId: string, body: RedeemPromoRequest): Promise<RedeemPromoResponse> {
    const code = (body.code || '').trim();
    const starshipId = body.starshipId;

    if (!userId?.trim()) throw new Error('UNAUTHENTICATED');
    if (!code) throw new Error('PROMO_CODE_REQUIRED');
    if (!starshipId?.trim()) throw new Error('STARSHIP_ID_REQUIRED');

    // Verify access to starship (owner)
    const hasAccess = await this.starshipService.hasAccess(userId, starshipId);
    if (!hasAccess) {
      throw new Error('FORBIDDEN');
    }

    // Query Stripe directly and expand the coupon (typed on Stripe.PromotionCode.promotion.coupon).
    const codeLower = code.toLowerCase();
    const codeUpper = code.toUpperCase();
    const expandFields: string[] = ['data.promotion', 'data.promotion.coupon'];

    const fetchFor = async (c: string) => this.stripe.promotionCodes.list({ code: c, limit: 20, expand: expandFields });

    const lists = [] as Array<Stripe.ApiList<Stripe.PromotionCode>>;
    lists.push(await fetchFor(code));
    if (!lists[0]?.data?.length && codeLower !== code) lists.push(await fetchFor(codeLower));
    if (lists.every((l) => !l?.data?.length) && codeUpper !== code) lists.push(await fetchFor(codeUpper));

    const raw = lists.flatMap((l) => l?.data ?? []);
    const seen = new Set<string>();
    const promos = raw.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    const now = Math.floor(Date.now() / 1000);
    const matching = promos.filter((p) => (p.code || '').toLowerCase() === codeLower);
    if (!matching.length) throw new Error('PROMO_CODE_INVALID');

    const activeCandidates = matching.filter((p) => p.active && (!p.expires_at || p.expires_at > now));
    if (!activeCandidates.length) throw new Error('PROMO_CODE_EXPIRED');

    // Choose the first candidate with a supported USD amount_off coupon
    let chosen: Stripe.PromotionCode | null = null;
    let couponObj: Stripe.Coupon | null = null;
    for (const p of activeCandidates) {
      const pcoupon = p.promotion?.coupon ?? null;
      const coupon = pcoupon && typeof pcoupon !== 'string' ? pcoupon : null;
      const usdAmount = coupon?.amount_off && coupon?.currency?.toLowerCase() === 'usd' ? coupon.amount_off : 0;
      if (usdAmount && usdAmount > 0) {
        chosen = p;
        couponObj = coupon;
        if (p.code === code) break; // prefer exact case
      }
    }

    if (!chosen || !couponObj) throw new Error('UNSUPPORTED_COUPON');

    const reward = couponObj?.amount_off && couponObj?.currency?.toLowerCase() === 'usd' ? couponObj.amount_off / 100 : 0;
    if (reward <= 0) {
      throw new Error('UNSUPPORTED_COUPON');
    }

    // Find wallet for starship
    const wallet = await this.walletRepo.findByStarshipId(starshipId);
    if (!wallet) {
      throw new Error('WALLET_NOT_FOUND');
    }

    const connection = getConnection();
    const rewardStr = reward.toFixed(6);

    // Atomic transaction: enforce max_redemptions (if any) -> create redemption (unique per user+code) -> credit wallet -> ledger
    const { balance } = await connection.transaction(async (client) => {
      // If Stripe promotion code has a max_redemptions, enforce it using our own counter.
      const maxRedeems: number | null = chosen.max_redemptions ?? null;
      const promoIdForLock = chosen.id || `code:${codeLower}`;

      if (maxRedeems && maxRedeems > 0) {
        // Use advisory lock to prevent race conditions under concurrency
        // hashtext-like behavior: generate a stable int from the id string
        const hashInt = BigInt('0x' + Buffer.from(promoIdForLock).toString('hex').slice(0, 15));
        const key = Number(hashInt % BigInt(2147483647));
        await client.query('SELECT pg_advisory_xact_lock($1)', [key]);

        // Count successful redemptions so far
        let used = 0;
        used = await this.redemptionRepo.countSuccessfulByPromotionIdWithClient(client, chosen.id);

        if (used >= maxRedeems) {
          throw new Error('PROMO_CODE_EXHAUSTED');
        }
      }
      // Idempotency: attempt insert; if conflict, throw already used
      try {
        await this.redemptionRepo.createWithClient(client, {
          userId,
          promoCode: code,
          stripeCouponId: couponObj.id,
          stripePromotionId: chosen.id,
          rewardAmount: rewardStr,
          status: 'success',
          message: 'Wallet credit',
        });
      } catch (e: unknown) {
        // Unique violation -> already redeemed by this user
        const err = e as { code?: string };
        if (err?.code === '23505') {
          throw new Error('ALREADY_USED');
        }
        throw e;
      }

      // Credit wallet
      const newBalance = await this.walletRepo.incrementBalanceReturningWithClient(client, wallet.id, rewardStr);

      // Ledger entry
      await this.ledgerRepo.createWithClient(client, {
        walletId: wallet.id,
        type: 'ADJUSTMENT',
        amount: rewardStr,
        balanceAfter: newBalance.balance,
        meta: {
          source: 'PROMO',
          promoCode: code,
          stripeCouponId: couponObj.id,
          stripePromotionId: chosen.id,
        },
      });

      return newBalance;
    });

    return {
      message: `✅ Promo applied! $${Number(rewardStr).toFixed(2)} added to your wallet.`,
      newBalance: balance,
    };
  }
}

export default PromoService;
