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

function readEnv(name: keyof PublicEnvConfig): string {
  // K8s secrets and CI envs sometimes include trailing newlines/whitespace.
  // Trimming here prevents subtle prod-only bugs (e.g. ENABLE_INDEXING="true\n").
  return String(process.env[name] || '').trim();
}

/**
 * Edge-safe env accessor for Next.js apps/middleware.
 *
 * IMPORTANT:
 * - Do NOT import dotenv/path/etc here.
 * - Keep this file dependency-free so it can be used in Next middleware (edge runtime).
 */
export function getPublicEnvConfig(): PublicEnvConfig {
  return {
    // IMPORTANT: must be explicitly configured per environment.
    // Intentionally no default to avoid accidentally using production in dev/staging.
    PUBLIC_URL: readEnv('PUBLIC_URL'),
    ENABLE_INDEXING: readEnv('ENABLE_INDEXING'),
    GA_MEASUREMENT_ID: readEnv('GA_MEASUREMENT_ID'),
    USERBACK_TOKEN: readEnv('USERBACK_TOKEN'),
    POSTHOG_KEY: readEnv('POSTHOG_KEY'),
    POSTHOG_HOST: readEnv('POSTHOG_HOST'),
  };
}

// Convenience export (avoids repeated function calls).
export const publicEnvConfig: PublicEnvConfig = getPublicEnvConfig();


