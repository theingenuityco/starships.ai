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
    <section className="relative pt-8 sm:pt-10 pb-12 sm:pb-14 px-4 bg-white">
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="relative group">
          <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
          <Card className="relative overflow-hidden px-6 sm:px-8 py-8 sm:py-9 border-0 shadow-lg flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6 text-center md:text-left bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold mb-2 text-white">Meet your AI team in minutes</h2>
              <p className="text-sm text-white/85">Start free, then scale up when you’re ready.</p>
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
