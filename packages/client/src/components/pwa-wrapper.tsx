import { connection } from 'next/server'
import { getPublicEnvConfig } from '@starships/env/public'
import PwaClient from '@/app/pwa/pwa-client'

/**
 * Server component that reads VAPID public key at runtime
 * and passes it to the PWA client UI.
 */
export async function PwaWrapper() {
  await connection()

  const { VAPID_PUBLIC_KEY } = getPublicEnvConfig()
  const publicKey = VAPID_PUBLIC_KEY || null

  return <PwaClient publicKey={publicKey} />
}
