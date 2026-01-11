export type PublicEnvConfig = {
  PUBLIC_URL: string;
  ENABLE_INDEXING: string;
  /**
   * Google Analytics measurement ID (public).
   * Example: G-XXXXXXXXXX
   */
  GA_MEASUREMENT_ID: string;
  /**
   * Userback widget token (public).
   */
  USERBACK_TOKEN: string;
  /**
   * PostHog project API key (public).
   * We still recommend reading it server-side and passing it down,
   * but it is not a secret.
   */
  POSTHOG_KEY: string;
  /**
   * PostHog ingestion host (optional).
   * Examples:
   * - https://us.i.posthog.com
   * - https://eu.i.posthog.com
   */
  POSTHOG_HOST: string;
};

/**
 * Edge-safe env accessor for Next.js apps/middleware.
 *
 * IMPORTANT:
 * - Do NOT import dotenv/path/etc here.
 * - Keep this file dependency-free so it can be used in Next middleware (edge runtime).
 */
export function getPublicEnvConfig(): PublicEnvConfig {
  return {
    // Keep local/dev usable without forcing env injection.
    PUBLIC_URL: process.env.PUBLIC_URL || 'https://starships.ai',
    ENABLE_INDEXING: process.env.ENABLE_INDEXING || '',
    GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID || '',
    USERBACK_TOKEN: process.env.USERBACK_TOKEN || '',
    POSTHOG_KEY: process.env.POSTHOG_KEY || '',
    POSTHOG_HOST: process.env.POSTHOG_HOST || '',
  };
}

// Convenience export (avoids repeated function calls).
export const publicEnvConfig: PublicEnvConfig = getPublicEnvConfig();


