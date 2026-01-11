import { connection } from 'next/server'
import { UserbackProvider } from './userback-provider'
import { getPublicEnvConfig } from '@starships/env/public'

/**
 * Server component that reads USERBACK_TOKEN at runtime and passes it to the client
 * Uses dynamic rendering to ensure env vars are read at request time
 */
export async function UserbackWrapper({ children }: { children: React.ReactNode }) {
  // Force dynamic rendering
  await connection()

  const { USERBACK_TOKEN } = getPublicEnvConfig()
  const token = USERBACK_TOKEN

  if (!token) {
    console.warn('USERBACK_TOKEN not found in environment variables')
    return <>{children}</>
  }

  return <UserbackProvider token={token}>{children}</UserbackProvider>
}
