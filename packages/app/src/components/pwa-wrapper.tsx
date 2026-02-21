import { connection } from 'next/server'
import { getPublicEnvConfig } from '@starships/env/public'
import PwaClient from '../app/(app)/pwa/pwa-client'

export async function PwaWrapper() {
  await connection()

  const { VAPID_PUBLIC_KEY } = getPublicEnvConfig()
  const publicKey = VAPID_PUBLIC_KEY || null

  return <PwaClient publicKey={publicKey} />
}
