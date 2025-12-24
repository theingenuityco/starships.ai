export type PublicEnvConfig = {
  PUBLIC_URL: string;
  ENABLE_INDEXING: string;
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
  };
}

// Convenience export (avoids repeated function calls).
export const publicEnvConfig: PublicEnvConfig = getPublicEnvConfig();


