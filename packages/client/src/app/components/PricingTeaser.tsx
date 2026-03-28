'use client'
import { landingWhiteCtaOnGradientLg } from '@/app/components/landing/landingSurface'
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
    <section className="relative pt-8 sm:pt-10 pb-12 sm:pb-14 px-4 bg-white">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="relative group">
          <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
          <Card className="relative flex flex-col items-center justify-between gap-5 overflow-hidden border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-6 py-8 text-center shadow-lg sm:gap-6 sm:px-8 sm:py-9 md:flex-row md:text-left">
            <div>
              <h2 className="mb-2 text-2xl font-semibold text-white md:text-3xl">Meet your AI team in minutes</h2>
              <p className="text-sm text-white/85">Start free, then scale up when you’re ready.</p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" className={landingWhiteCtaOnGradientLg} onClick={handleClick}>
                {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Get Started Free'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
