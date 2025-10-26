import { connection } from 'next/server'
import { UserbackProvider } from './userback-provider'

/**
 * Server Component that reads USERBACK_TOKEN at runtime
 * Uses dynamic rendering to ensure env vars are read at request time
 *
 * This allows the same Docker image to be deployed across environments
 * with different USERBACK_TOKEN values injected at runtime
 */
export async function UserbackWrapper({ children }: { children: React.ReactNode }) {
  // Force dynamic rendering by using connection() API
  // This ensures env vars are evaluated at runtime, not build time
  await connection()

  // Read env var at runtime (available on server-side only by default)
  const userbackToken = process.env.USERBACK_TOKEN

  if (!userbackToken) {
    console.warn('USERBACK_TOKEN not found in environment variables')
    return <>{children}</>
  }

  // Pass the runtime value to the client component
  return <UserbackProvider token={userbackToken}>{children}</UserbackProvider>
}
