import { PwaWrapper } from '@/components/pwa-wrapper'

export default function PwaPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Progressive Web App</h1>
        <p className="text-sm text-muted-foreground">
          Manage installation and push notification settings for the Starships.ai PWA.
        </p>
      </header>
      <PwaWrapper />
    </div>
  )
}
