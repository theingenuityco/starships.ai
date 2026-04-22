import HomePageClient from './home-page-client'

// Public marketing page: rendered on-demand (avoid build-time API dependency).
export const dynamic = 'force-dynamic'
// Hints Next Data Cache; home HTML uses strict Cache-Control in next.config (avoid CDN stale shell vs client).
export const fetchCache = 'force-no-store'
export const revalidate = 3600 // 1 hour

export default async function HomePage() {
  return <HomePageClient />
}
