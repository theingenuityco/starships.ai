import { connection } from 'next/server'
import { UserbackProvider } from './userback-provider'

/**
 * Server component that reads USERBACK_TOKEN at runtime and passes it to the client
 * Uses dynamic rendering to ensure env vars are read at request time
 */
export async function UserbackWrapper({ children }: { children: React.ReactNode }) {
  // Force dynamic rendering
  await connection()

  // Read env var at runtime
  const token = process.env.USERBACK_TOKEN

  if (!token) {
    console.warn('USERBACK_TOKEN not found in environment variables')
    return <>{children}</>
  }

  return <UserbackProvider token={token}>{children}</UserbackProvider>
}
