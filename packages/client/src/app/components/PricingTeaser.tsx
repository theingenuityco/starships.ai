'use client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'

export default function PricingTeaser() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { getSelectedStarshipId } = useSelectedStarship()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = pickPrimaryStarshipForUser(starships, user?.id, getSelectedStarshipId())

  const handleClick = () => {
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}`)
      return
    }
    router.push('/login')
  }
  return (
    <section className="relative pt-10 pb-14 px-4">
      {/* Blend the white Security section above into this darker CTA band, without overlapping the CTA card */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 sm:h-24 z-0"
        style={{
          background:
            'linear-gradient(to bottom, #ffffff 0%, #ffffff 55%, rgba(255,255,255,0.65) 80%, rgba(15,23,42,0) 100%)',
        }}
        aria-hidden
      />
      <div className="relative z-10 max-w-6xl mx-auto mt-24 sm:mt-28">
        <div className="relative group">
          <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
          <Card className="relative overflow-hidden px-6 py-10 border-0 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/15 to-amber-500/15">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold mb-2">Meet your AI team in minutes</h2>
              <p className="text-sm text-muted-foreground">Start free, then scale up when you’re ready.</p>
            </div>
            <div className="flex gap-3">
              <Button
                size="lg"
                className="relative h-14 px-8 text-base sm:text-lg leading-none overflow-hidden rounded-full whitespace-nowrap text-center text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_6px_0_0_rgba(15,23,42,0.18)] hover:shadow-[0_4px_0_0_rgba(15,23,42,0.22)] hover:-translate-y-[1px] active:shadow-[0_0px_0_0_rgba(15,23,42,0.22)] active:translate-y-[2px] transition"
                onClick={handleClick}
              >
                {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Get Started for free'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
