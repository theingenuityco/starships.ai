'use client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'

export default function PricingTeaser() {
  const { isAuthenticated, user } = useAuth()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = starships[0]

  const handleClick = () => {
    if (isAuthenticated && primaryStarship?.slug) {
      window.location.href = `/ship/${primaryStarship.slug}/conversations`
      return
    }
    window.location.href = '/login'
  }
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="relative group">
          <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
          <Card className="relative overflow-hidden px-6 py-10 border-0 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/15 to-amber-500/15">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold mb-2">Meet your team in minutes</h2>
              <p className="text-sm text-muted-foreground">Start free, then bring your own model keys when you’re ready.</p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" variant="outline" className="h-12 px-10 text-base" onClick={handleClick}>
                {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Launch your starship now'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
