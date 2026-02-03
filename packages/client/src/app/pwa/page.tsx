import { connection } from 'next/server'
import PwaClient from './pwa-client'

export default async function PwaPage() {
  await connection()
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Progressive Web App</h1>
        <p className="text-sm text-muted-foreground">
          Manage installation and push notification settings for the Starships.ai PWA.
        </p>
      </header>
      <PwaClient publicKey={publicKey} />
    </div>
  )
}
