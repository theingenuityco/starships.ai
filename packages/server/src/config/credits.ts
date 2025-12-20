/**
 * Credits billing configuration.
 *
 * Credits are unit-less and stored as DECIMAL(18,6) in the `wallets.balance` column.
 * We keep 6 decimal places for compatibility with the existing wallet precision.
 */
export const CREDITS_DECIMALS = 6;
export const CREDITS_PER_USD = 200; // $1 -> 200 credits (default pricing)
export const CREDITS_PER_USER_MESSAGE = 10; // fixed cost per user message (default)

export function toCreditsString(n: number): string {
  // Preserve existing precision conventions across the codebase
  return (Number.isFinite(n) ? n : 0).toFixed(CREDITS_DECIMALS);
}
