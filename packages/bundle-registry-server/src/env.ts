import { z } from 'zod';
// Important: this import loads repo-root `.env` via dotenv (side-effect),
// matching the rest of the monorepo behavior.
// It does NOT validate unless callers invoke getEnvConfig().
import '@starships/env';

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  BUNDLE_REGISTRY_PORT: z.coerce.number().int().min(1).max(65535).default(4020),
  BUNDLE_REGISTRY_AUTH_TOKEN: z.string().min(20),

  BUNDLE_REGISTRY_S3_BUCKET: z.string().min(3),
  BUNDLE_REGISTRY_S3_REGION: z.string().min(3),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type BundleRegistryEnv = z.infer<typeof EnvSchema>;

export function getBundleRegistryEnv(): BundleRegistryEnv {
  const parsed = EnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    BUNDLE_REGISTRY_PORT: process.env.BUNDLE_REGISTRY_PORT,
    BUNDLE_REGISTRY_AUTH_TOKEN: process.env.BUNDLE_REGISTRY_AUTH_TOKEN,
    BUNDLE_REGISTRY_S3_BUCKET: process.env.BUNDLE_REGISTRY_S3_BUCKET,
    BUNDLE_REGISTRY_S3_REGION: process.env.BUNDLE_REGISTRY_S3_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid bundle registry env: ${issues}`);
  }
  return parsed.data;
}

