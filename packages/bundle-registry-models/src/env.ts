import { z } from 'zod';

const EnvSchema = z.object({
  BUNDLE_REGISTRY_POSTGRES_HOST: z.string().min(1).default('postgres'),
  BUNDLE_REGISTRY_POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  BUNDLE_REGISTRY_POSTGRES_USER: z.string().min(1).default('postgres'),
  BUNDLE_REGISTRY_POSTGRES_PASSWORD: z.string().min(1),
  BUNDLE_REGISTRY_POSTGRES_DATABASE: z.string().min(1).default('bundle_registry'),
  BUNDLE_REGISTRY_POSTGRES_SSL: z
    .string()
    .optional()
    .transform((v) => (String(v || '').trim().toLowerCase() === 'true' ? 'true' : 'false'))
    .pipe(z.enum(['true', 'false']))
    .transform((v) => v === 'true'),
});

export type BundleRegistryDbEnv = z.infer<typeof EnvSchema>;

export function getBundleRegistryDbEnv(): BundleRegistryDbEnv {
  const parsed = EnvSchema.safeParse({
    BUNDLE_REGISTRY_POSTGRES_HOST: process.env.BUNDLE_REGISTRY_POSTGRES_HOST,
    BUNDLE_REGISTRY_POSTGRES_PORT: process.env.BUNDLE_REGISTRY_POSTGRES_PORT,
    BUNDLE_REGISTRY_POSTGRES_USER: process.env.BUNDLE_REGISTRY_POSTGRES_USER,
    BUNDLE_REGISTRY_POSTGRES_PASSWORD: process.env.BUNDLE_REGISTRY_POSTGRES_PASSWORD,
    BUNDLE_REGISTRY_POSTGRES_DATABASE: process.env.BUNDLE_REGISTRY_POSTGRES_DATABASE,
    BUNDLE_REGISTRY_POSTGRES_SSL: process.env.BUNDLE_REGISTRY_POSTGRES_SSL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid bundle registry db env: ${issues}`);
  }
  return parsed.data;
}

